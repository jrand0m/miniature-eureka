// T002/T005/T009/T011/T013: Admin-only book catalog & inventory management — see
// specs/003-admin-book-mgmt/contracts/admin-api.md. Mounted at /admin/books, gated by
// requireAdminToken for the whole group, exactly like routes/users.ts's usersRoutes. Kept in a
// separate file from routes/books.ts (public, unauthenticated GET /books, GET /books/:id) so
// every route file keeps a single, uniform auth posture.
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAdminToken } from "../middleware/require-admin-token";
import {
  adjustQuantity,
  createBook,
  deleteBook,
  updateBook,
  type CreateBookParams,
  type UpdateBookParams,
} from "../services/books";

export const adminBooksRoutes = new Hono<AppEnv>();

adminBooksRoutes.use("*", ...requireAdminToken);

interface CreateBookBody {
  title?: unknown;
  author?: unknown;
  isbn?: unknown;
  description?: unknown;
  quantityTotal?: unknown;
}

function parseCreateBody(body: CreateBookBody | null): CreateBookParams | null {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const author = typeof body?.author === "string" ? body.author.trim() : "";
  const quantityTotal = body?.quantityTotal;
  if (!title || !author) return null;
  if (typeof quantityTotal !== "number" || !Number.isInteger(quantityTotal) || quantityTotal < 0) {
    return null;
  }
  const isbn = typeof body?.isbn === "string" && body.isbn.trim() !== "" ? body.isbn : null;
  const description =
    typeof body?.description === "string" && body.description.trim() !== "" ? body.description : null;
  return { title, author, isbn, description, quantityTotal };
}

// T005: POST /admin/books — see contracts/admin-api.md
adminBooksRoutes.post("/", async (c) => {
  const body = await c.req.json<CreateBookBody>().catch(() => null);
  const parsed = parseCreateBody(body);
  if (!parsed) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const book = await createBook(c.env.DB, parsed);
  return c.json(book, 201);
});

interface UpdateBookBody {
  title?: unknown;
  author?: unknown;
  isbn?: unknown;
  description?: unknown;
}

function parseUpdateBody(body: UpdateBookBody | null): UpdateBookParams | null {
  if (body === null || typeof body !== "object") return null;
  const params: UpdateBookParams = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.trim() === "") return null;
    params.title = body.title.trim();
  }
  if ("author" in body) {
    if (typeof body.author !== "string" || body.author.trim() === "") return null;
    params.author = body.author.trim();
  }
  if ("isbn" in body) {
    params.isbn = typeof body.isbn === "string" && body.isbn.trim() !== "" ? body.isbn : null;
  }
  if ("description" in body) {
    params.description =
      typeof body.description === "string" && body.description.trim() !== "" ? body.description : null;
  }

  return params;
}

// T011: PATCH /admin/books/:id — see contracts/admin-api.md. Never touches quantities (FR-004).
adminBooksRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<UpdateBookBody>().catch(() => null);
  const parsed = parseUpdateBody(body);
  if (!parsed) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const book = await updateBook(c.env.DB, id, parsed);
  if (!book) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json(book);
});

// T013: DELETE /admin/books/:id — see contracts/admin-api.md. Blocked (409) while any copies
// are checked out (quantity_available < quantity_total) — research.md's delete-blocking
// decision.
adminBooksRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteBook(c.env.DB, id);
  if (result === "not_found") {
    return c.json({ error: "not_found" }, 404);
  }
  if (result === "blocked") {
    return c.json({ error: "copies_unavailable" }, 409);
  }
  return c.body(null, 204);
});

interface AdjustQuantityBody {
  delta?: unknown;
}

// T009: POST /admin/books/:id/quantity — see contracts/admin-api.md. A negative delta that
// would take quantity_available below zero is rejected with 409 and the book is left unchanged
// (FR-008).
adminBooksRoutes.post("/:id/quantity", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<AdjustQuantityBody>().catch(() => null);
  const delta = body?.delta;
  if (typeof delta !== "number" || !Number.isInteger(delta)) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await adjustQuantity(c.env.DB, id, delta);
  if (result.status === "not_found") {
    return c.json({ error: "not_found" }, 404);
  }
  if (result.status === "insufficient_quantity") {
    return c.json({ error: "insufficient_quantity" }, 409);
  }
  return c.json(result.book);
});
