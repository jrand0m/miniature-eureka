// T002: Book data-access service — see specs/002-book-catalog-search/data-model.md
// T001: extended with admin write operations — see specs/003-admin-book-mgmt/data-model.md

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  quantityTotal: number;
  quantityAvailable: number;
  createdAt: string;
}

interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  quantity_total: number;
  quantity_available: number;
  created_at: string;
}

function mapRow(row: BookRow): BookRecord {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    description: row.description,
    quantityTotal: row.quantity_total,
    quantityAvailable: row.quantity_available,
    createdAt: row.created_at,
  };
}

// Escapes SQL LIKE wildcards (% and _) in user-supplied search terms so they are matched
// literally, then wraps the term for a partial (substring) match. `LIKE` in SQLite is
// case-insensitive for ASCII by default, matching this feature's FR-003.
function likeTerm(term: string): string {
  const escaped = term.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

export interface ListBooksParams {
  title?: string;
  author?: string;
  limit: number;
  offset: number;
}

export interface ListBooksResult {
  books: BookRecord[];
  total: number;
}

export async function listBooks(
  db: D1Database,
  params: ListBooksParams,
): Promise<ListBooksResult> {
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (params.title) {
    conditions.push("title LIKE ? ESCAPE '\\'");
    bindings.push(likeTerm(params.title));
  }
  if (params.author) {
    conditions.push("author LIKE ? ESCAPE '\\'");
    bindings.push(likeTerm(params.author));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM books ${where}`)
    .bind(...bindings)
    .first<{ count: number }>();
  const total = countRow?.count ?? 0;

  const { results } = await db
    .prepare(
      `SELECT * FROM books ${where} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, params.limit, params.offset)
    .all<BookRow>();

  return { books: results.map(mapRow), total };
}

export async function findBookById(db: D1Database, id: string): Promise<BookRecord | null> {
  const row = await db.prepare("SELECT * FROM books WHERE id = ?1").bind(id).first<BookRow>();
  return row ? mapRow(row) : null;
}

// Guarded decrement — only succeeds while a copy is actually available. Returns true if a copy
// was decremented, false if the book had zero copies available (caller must treat this as a
// race/conflict, not silently proceed). See specs/004-reservation-flow/research.md.
export async function decrementQuantityAvailable(db: D1Database, bookId: string): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE books SET quantity_available = quantity_available - 1 WHERE id = ?1 AND quantity_available > 0",
    )
    .bind(bookId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// T006: mirror-image guarded increment, used when an admin confirms a book's return — see
// specs/005-admin-loan-oversight/research.md §3. No upper-bound guard is needed beyond the
// table's own `CHECK (quantity_available <= quantity_total)` constraint: a `checked_out`/
// `return_requested` reservation implies a copy is genuinely out, so that CHECK should never be
// violated in normal operation. If it somehow is, the UPDATE fails (`changes === 0`) and the
// caller treats that as an unexpected internal error, not a modeled outcome.
export async function incrementQuantityAvailable(db: D1Database, bookId: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE books SET quantity_available = quantity_available + 1 WHERE id = ?1")
    .bind(bookId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export interface CreateBookParams {
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  quantityTotal: number;
}

// T005: POST /admin/books — see contracts/admin-api.md. `quantityAvailable` is always set equal
// to `quantityTotal` at creation (FR-003); id/createdAt follow the same convention as
// services/users.ts's createUser (crypto.randomUUID(), new Date().toISOString()).
export async function createBook(db: D1Database, params: CreateBookParams): Promise<BookRecord> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO books (id, title, author, isbn, description, quantity_total, quantity_available, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      id,
      params.title,
      params.author,
      params.isbn,
      params.description,
      params.quantityTotal,
      params.quantityTotal,
      createdAt,
    )
    .run();
  return {
    id,
    title: params.title,
    author: params.author,
    isbn: params.isbn,
    description: params.description,
    quantityTotal: params.quantityTotal,
    quantityAvailable: params.quantityTotal,
    createdAt,
  };
}

export interface UpdateBookParams {
  title?: string;
  author?: string;
  isbn?: string | null;
  description?: string | null;
}

// T011: PATCH /admin/books/:id — edits descriptive fields only; quantities are never touched
// here (FR-004). A field absent from `params` is left unchanged; a body with no fields present
// is a valid no-op (spec Edge Cases). Returns null if the book does not exist.
export async function updateBook(
  db: D1Database,
  id: string,
  params: UpdateBookParams,
): Promise<BookRecord | null> {
  const sets: string[] = [];
  const bindings: unknown[] = [];

  if (params.title !== undefined) {
    sets.push("title = ?");
    bindings.push(params.title);
  }
  if (params.author !== undefined) {
    sets.push("author = ?");
    bindings.push(params.author);
  }
  if (params.isbn !== undefined) {
    sets.push("isbn = ?");
    bindings.push(params.isbn);
  }
  if (params.description !== undefined) {
    sets.push("description = ?");
    bindings.push(params.description);
  }

  if (sets.length > 0) {
    bindings.push(id);
    await db
      .prepare(`UPDATE books SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...bindings)
      .run();
  }

  return findBookById(db, id);
}

export type AdjustQuantityResult =
  | { status: "not_found" }
  | { status: "insufficient_quantity" }
  | { status: "ok"; book: BookRecord };

// T009: POST /admin/books/:id/quantity — applies a signed delta to both quantity_total and
// quantity_available (FR-007). The invariant check (a negative delta must not take
// quantity_available below zero, FR-008) is expressed directly in the UPDATE's WHERE clause so
// the check-then-write is atomic — no separate read-then-conditionally-write race window
// (research.md).
export async function adjustQuantity(
  db: D1Database,
  id: string,
  delta: number,
): Promise<AdjustQuantityResult> {
  const result = await db
    .prepare(
      `UPDATE books
       SET quantity_total = quantity_total + ?1, quantity_available = quantity_available + ?2
       WHERE id = ?3 AND quantity_available + ?4 >= 0`,
    )
    .bind(delta, delta, id, delta)
    .run();

  if (result.meta.changes === 0) {
    // Either no book with this id exists, or the WHERE guard rejected the update because it
    // would have taken quantity_available below zero — disambiguate with a lookup.
    const existing = await findBookById(db, id);
    return existing ? { status: "insufficient_quantity" } : { status: "not_found" };
  }

  const book = await findBookById(db, id);
  return { status: "ok", book: book as BookRecord };
}

export type DeleteBookResult = "not_found" | "blocked" | "deleted";

// T013: DELETE /admin/books/:id — allowed only when quantity_available === quantity_total (no
// copies currently checked out); see research.md's delete-blocking decision. Expressed as a
// single conditional DELETE for the same atomicity reason as adjustQuantity above.
export async function deleteBook(db: D1Database, id: string): Promise<DeleteBookResult> {
  const result = await db
    .prepare("DELETE FROM books WHERE id = ?1 AND quantity_available = quantity_total")
    .bind(id)
    .run();

  if (result.meta.changes > 0) {
    return "deleted";
  }

  const existing = await findBookById(db, id);
  return existing ? "blocked" : "not_found";
}
