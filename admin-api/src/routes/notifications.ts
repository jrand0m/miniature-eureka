// T003 + T009: GET /notifications, POST /notifications/:id/read, GET /notifications/stream —
// see specs/006-notifications/contracts/admin-api.md
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/require-auth";
import {
  listNotificationsByUser,
  listNotificationsSince,
  markRead,
  type NotificationRecord,
} from "../services/notifications";

export const notificationsRoutes = new Hono<AppEnv>();

notificationsRoutes.use("*", requireAuth);

function serializeNotification(n: NotificationRecord) {
  return {
    id: n.id,
    type: n.type,
    message: n.message,
    relatedReservationId: n.relatedReservationId,
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}

// GET /notifications — the calling user's notification history, most recent first.
notificationsRoutes.get("/", async (c) => {
  const userId = c.get("user").sub;
  const notifications = await listNotificationsByUser(c.env.DB, userId);
  return c.json({ notifications: notifications.map(serializeNotification) });
});

// POST /notifications/:id/read — mark one of the caller's own notifications read; 404 (not
// 403) both when it doesn't exist and when it belongs to someone else, mirroring
// 005-user-profile-return's requestReturn ownership-scoping pattern.
notificationsRoutes.post("/:id/read", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").sub;
  const result = await markRead(c.env.DB, id, userId);
  switch (result.outcome) {
    case "not_found":
      return c.json({ error: "not_found" }, 404);
    case "ok":
      return c.json({ notification: serializeNotification(result.notification) });
  }
});

// Tuning constants for the DB-polling SSE stream — see specs/006-notifications/research.md §1.
// No Durable Objects exist in this repo and Workers has no persistent in-memory process shared
// across requests, so this is a deliberate polling-based approximation of a live stream, not
// true server push. Known limitation: the connection is closed after MAX_CONNECTION_MS regardless
// of activity; the Public UI client is responsible for reconnecting (see
// public-ui/src/services/notifications-client.ts's openNotificationStream).
const POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_CONNECTION_MS = 5 * 60_000;

// GET /notifications/stream — see contracts/admin-api.md. Must be consumed via an authenticated
// fetch() + manual ReadableStream parsing on the client, NOT the browser's native EventSource
// (which cannot send the Authorization header this codebase's auth model requires everywhere).
notificationsRoutes.get("/stream", async (c) => {
  const userId = c.get("user").sub;
  const db = c.env.DB;

  // Seed the cursor from the caller's most recent existing notification (if any) so the stream
  // only ever emits notifications created after the connection opened, not the caller's entire
  // history (GET /notifications already serves history).
  const history = await listNotificationsByUser(db, userId);
  let lastCreatedAt = history[0]?.createdAt ?? "";
  let lastId = history[0]?.id ?? "";

  return streamSSE(c, async (stream) => {
    const startedAt = Date.now();
    let lastHeartbeatAt = Date.now();

    while (!stream.aborted && !stream.closed && Date.now() - startedAt < MAX_CONNECTION_MS) {
      const fresh = await listNotificationsSince(db, userId, lastCreatedAt, lastId);
      for (const notification of fresh) {
        await stream.writeSSE({
          event: "notification",
          data: JSON.stringify(serializeNotification(notification)),
          id: notification.id,
        });
        lastCreatedAt = notification.createdAt;
        lastId = notification.id;
      }

      if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        await stream.write(": heartbeat\n\n");
        lastHeartbeatAt = Date.now();
      }

      await stream.sleep(POLL_INTERVAL_MS);
    }

    // Graceful close after MAX_CONNECTION_MS (or client disconnect) — the client is expected to
    // reconnect to resume live delivery (research.md §1).
  });
});
