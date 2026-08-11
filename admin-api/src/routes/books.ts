import { Hono } from "hono";
import type { AppEnv } from "../types";
import { findBookById, listBooks } from "../services/books";

// Part of the public library surface (Constitution v1.3.0, Principle I item b): these
// endpoints are intentionally unauthenticated — no requireAdminToken/requireAuth here.
export const booksRoutes = new Hono<AppEnv>();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 0;
  return n;
}

// T003: GET /books — see contracts/admin-api.md
booksRoutes.get("/", async (c) => {
  const title = c.req.query("title")?.trim() || undefined;
  const author = c.req.query("author")?.trim() || undefined;
  const limit = parseLimit(c.req.query("limit"));
  const offset = parseOffset(c.req.query("offset"));

  const { books, total } = await listBooks(c.env.DB, { title, author, limit, offset });

  return c.json({ books, limit, offset, total });
});

// T010: GET /books/:id — see contracts/admin-api.md
booksRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const book = await findBookById(c.env.DB, id);
  if (!book) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json(book);
});
