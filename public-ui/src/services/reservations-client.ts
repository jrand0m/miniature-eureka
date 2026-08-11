// Calls the Admin API's authenticated reservation endpoints from the browser — part of the
// public library surface a signed-in visitor may call at runtime, per Constitution
// Principle II / v1.3.0 ("a signed-in user's own reservations").
import { getToken } from "./auth-client";

const API_BASE = import.meta.env.VITE_ADMIN_API_BASE_URL;

export interface Reservation {
  id: string;
  bookId: string;
  userId: string;
  status:
    | "pending"
    | "confirmed"
    | "checked_out"
    | "return_requested"
    | "returned"
    | "cancelled";
  requestedDate: string;
  agreedDate: string | null;
  checkedOutAt: string | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export interface ReservationError {
  error: string;
}

export async function createReservation(
  bookId: string,
  requestedDate: string,
): Promise<ApiResult<{ reservation: Reservation } | ReservationError>> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ bookId, requestedDate }),
  });
  const data = (await res.json().catch(() => ({}))) as { reservation: Reservation } | ReservationError;
  return { ok: res.ok, status: res.status, data };
}

export async function listMyReservations(): Promise<ApiResult<{ reservations: Reservation[] } | ReservationError>> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reservations`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = (await res.json().catch(() => ({}))) as { reservations: Reservation[] } | ReservationError;
  return { ok: res.ok, status: res.status, data };
}
