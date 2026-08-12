// T006: calls the Admin API's public catalog endpoints from the browser — part of the
// public library surface the static Public UI is permitted to call at runtime, per
// Constitution Principle II / v1.3.0.
const API_BASE = import.meta.env.VITE_ADMIN_API_BASE_URL;

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  quantityTotal: number;
  quantityAvailable: number;
  createdAt: string;
}

export interface ListBooksResult {
  books: Book[];
  limit: number;
  offset: number;
  total: number;
}

export interface ListBooksParams {
  title?: string;
  author?: string;
  limit?: number;
  offset?: number;
}

export async function listBooks(params: ListBooksParams = {}): Promise<ListBooksResult> {
  const query = new URLSearchParams();
  if (params.title) query.set("title", params.title);
  if (params.author) query.set("author", params.author);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));

  const qs = query.toString();
  const res = await fetch(`${API_BASE}/books${qs ? `?${qs}` : ""}`);
  return (await res.json()) as ListBooksResult;
}
