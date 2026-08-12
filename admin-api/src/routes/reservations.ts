// T009 + T016: POST /reservations, GET /reservations — see contracts/admin-api.md
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/require-auth";
import { findBookById } from "../services/books";
import {
  createReservation,
  listReservationsByUser,
  requestReturn,
  type ReservationRecord,
} from "../services/reservations";

export const reservationsRoutes = new Hono<AppEnv>();

reservationsRoutes.use("*", requireAuth);

// T011: forceReturnRequestedAt included so a signed-in user can see whether an admin has
// flagged their loan for early return — see specs/005-admin-loan-oversight/contracts/admin-api.md.
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
    forceReturnRequestedAt: r.forceReturnRequestedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

interface CreateReservationBody {
  bookId?: unknown;
  requestedDate?: unknown;
}

// T009: POST /reservations — see contracts/admin-api.md
reservationsRoutes.post("/", async (c) => {
  const body = await c.req.json<CreateReservationBody>().catch(() => null);
  const bookId = typeof body?.bookId === "string" ? body.bookId.trim() : "";
  const requestedDate = typeof body?.requestedDate === "string" ? body.requestedDate.trim() : "";
  if (!bookId || !requestedDate) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const book = await findBookById(c.env.DB, bookId);
  if (!book) {
    return c.json({ error: "book_not_found" }, 404);
  }
  if (book.quantityAvailable <= 0) {
    return c.json({ error: "no_copies_available" }, 409);
  }

  const userId = c.get("user").sub;
  const reservation = await createReservation(c.env.DB, { bookId, userId, requestedDate });
  return c.json({ reservation: serializeReservation(reservation) }, 201);
});

// T016: GET /reservations — see contracts/admin-api.md
reservationsRoutes.get("/", async (c) => {
  const userId = c.get("user").sub;
  const reservations = await listReservationsByUser(c.env.DB, userId);
  return c.json({ reservations: reservations.map(serializeReservation) });
});

interface ReturnRequestBody {
  preferredReturnDate?: unknown;
}

// T007 (005-user-profile-return): POST /reservations/:id/return-request — see
// specs/005-user-profile-return/contracts/admin-api.md. Owner-only; 404 (not 403) both when the
// reservation doesn't exist and when it belongs to a different user, so as not to leak existence.
reservationsRoutes.post("/:id/return-request", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<ReturnRequestBody>().catch(() => null);
  const preferredReturnDate =
    typeof body?.preferredReturnDate === "string" ? body.preferredReturnDate.trim() : "";
  if (!preferredReturnDate) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const userId = c.get("user").sub;
  const result = await requestReturn(c.env.DB, id, userId, preferredReturnDate);
  switch (result.outcome) {
    case "not_found":
      return c.json({ error: "not_found" }, 404);
    case "invalid_status_transition":
      return c.json({ error: "invalid_status_transition" }, 409);
    case "ok":
      return c.json({ reservation: serializeReservation(result.reservation) }, 200);
  }
});
