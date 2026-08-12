// Calls the Admin API's authenticated notification endpoints from the browser — part of the
// public library surface a signed-in visitor may call at runtime, per Constitution Principle
// II / v1.3.0 ("reading their own notification stream/inbox").
import { getToken } from "./auth-client";

const API_BASE = import.meta.env.VITE_ADMIN_API_BASE_URL;

export interface Notification {
  id: string;
  type: string;
  message: string;
  relatedReservationId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export interface NotificationError {
  error: string;
}

// T008: GET /notifications — the caller's notification history, most recent first.
export async function listNotifications(): Promise<
  ApiResult<{ notifications: Notification[] } | NotificationError>
> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/notifications`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = (await res.json().catch(() => ({}))) as
    | { notifications: Notification[] }
    | NotificationError;
  return { ok: res.ok, status: res.status, data };
}

// T011: POST /notifications/:id/read — mark one of the caller's own notifications read.
export async function markNotificationRead(
  id: string,
): Promise<ApiResult<{ notification: Notification } | NotificationError>> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = (await res.json().catch(() => ({}))) as
    | { notification: Notification }
    | NotificationError;
  return { ok: res.ok, status: res.status, data };
}

export interface NotificationStreamHandle {
  close(): void;
}

// T010: GET /notifications/stream, consumed via an authenticated fetch() + manual
// ReadableStream/SSE-frame parsing — NOT the browser's native EventSource, which cannot send
// the Authorization header this codebase's bearer-token auth model requires everywhere. See
// specs/006-notifications/research.md §2.
//
// The server closes each connection after a bounded lifetime (~5 minutes; see
// admin-api/src/routes/notifications.ts). This function transparently reconnects after any
// stream end (graceful close, network error, or otherwise) so the caller's onNotification
// callback keeps receiving live updates indefinitely — this is the client half of that
// documented tradeoff (DB-polling SSE, not true push).
export function openNotificationStream(onNotification: (notification: Notification) => void): NotificationStreamHandle {
  const controller = new AbortController();
  let stopped = false;

  async function connectOnce(): Promise<void> {
    const token = getToken();
    if (!token) {
      return;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/notifications/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch {
      return;
    }

    if (!response.ok || !response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!stopped) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLines = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());
        if (dataLines.length === 0) continue; // heartbeat/comment-only frame — ignore

        try {
          const notification = JSON.parse(dataLines.join("\n")) as Notification;
          onNotification(notification);
        } catch {
          // Malformed frame — skip rather than crash the stream loop.
        }
      }
    }
  }

  async function loop(): Promise<void> {
    while (!stopped) {
      await connectOnce();
      if (stopped) break;
      // Brief pause before reconnecting so a persistently failing endpoint (e.g. logged out)
      // doesn't spin in a tight loop.
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  void loop();

  return {
    close(): void {
      stopped = true;
      controller.abort();
    },
  };
}
