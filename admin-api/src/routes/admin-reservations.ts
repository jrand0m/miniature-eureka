// T013 + T015 + T018: GET /admin/reservations, POST /admin/reservations/:id/confirm,
// POST /admin/reservations/:id/check-out — see contracts/admin-api.md
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAdminToken } from "../middleware/require-admin-token";
import {
  checkOutReservation,
  confirmReservation,
  isValidReservationStatus,
  listReservationsForAdmin,
  type AdminReservationRecord,
  type ReservationRecord,
  type ReservationStatus,
} from "../services/reservations";

export const adminReservationsRoutes = new Hono<AppEnv>();

adminReservationsRoutes.use("*", ...requireAdminToken);

function serializeReservation(r: ReservationRecord) {
  return {
    id: r.id,
    bookId: r.bookId,
    userId: r.userId,
    status: r.status,
    requestedDate: r.requestedDate,
    agreedDate: r.agreedDate,
    checkedOutAt: r.checkedOutAt,
    returnedAt: r.returnedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function serializeAdminReservation(r: AdminReservationRecord) {
  return {
    ...serializeReservation(r),
    bookTitle: r.bookTitle,
    bookAuthor: r.bookAuthor,
    userEmail: r.userEmail,
  };
}

// T018: GET /admin/reservations?status= — see contracts/admin-api.md
adminReservationsRoutes.get("/", async (c) => {
  const statusParam = c.req.query("status");
  let status: ReservationStatus | undefined;
  if (statusParam !== undefined) {
    if (!isValidReservationStatus(statusParam)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    status = statusParam;
  }

  const reservations = await listReservationsForAdmin(c.env.DB, status);
  return c.json({ reservations: reservations.map(serializeAdminReservation) });
});

interface ConfirmBody {
  agreedDate?: unknown;
}

// T013: POST /admin/reservations/:id/confirm — see contracts/admin-api.md
adminReservationsRoutes.post("/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<ConfirmBody>().catch(() => null);
  const agreedDate = typeof body?.agreedDate === "string" ? body.agreedDate.trim() : "";
  if (!agreedDate) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await confirmReservation(c.env.DB, id, agreedDate);
  switch (result.outcome) {
    case "not_found":
      return c.json({ error: "not_found" }, 404);
    case "invalid_status_transition":
      return c.json({ error: "invalid_status_transition" }, 409);
    case "no_copies_available":
      return c.json({ error: "no_copies_available" }, 409);
    case "ok":
      return c.json({ reservation: serializeReservation(result.reservation) }, 200);
  }
});

// T015: POST /admin/reservations/:id/check-out — see contracts/admin-api.md
adminReservationsRoutes.post("/:id/check-out", async (c) => {
  const id = c.req.param("id");
  const result = await checkOutReservation(c.env.DB, id);
  switch (result.outcome) {
    case "not_found":
      return c.json({ error: "not_found" }, 404);
    case "invalid_status_transition":
      return c.json({ error: "invalid_status_transition" }, 409);
    case "ok":
      return c.json({ reservation: serializeReservation(result.reservation) }, 200);
  }
});
