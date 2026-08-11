// T002: Book data-access service — see specs/002-book-catalog-search/data-model.md

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
