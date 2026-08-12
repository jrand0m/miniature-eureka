// T030: the Admin UI's only way of talking to the system, per Constitution Principle I.
const API_BASE = import.meta.env.VITE_ADMIN_API_BASE_URL;
const TOKEN_STORAGE_KEY = "library_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = (res.status === 204 ? {} : await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "user";
  registeredAt: string;
  lastLoginAt: string | null;
  enabled: boolean;
}

export async function login(
  email: string,
  password: string,
): Promise<ApiResult<{ token: string } | { error: string }>> {
  return request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function listUsers(): Promise<ApiResult<{ users: AdminUser[] } | { error: string }>> {
  return request("/admin/users");
}

export async function disableUser(id: string): Promise<ApiResult<{ error: string } | Record<string, never>>> {
  return request(`/admin/users/${id}/disable`, { method: "POST" });
}

export async function enableUser(id: string): Promise<ApiResult<{ error: string } | Record<string, never>>> {
  return request(`/admin/users/${id}/enable`, { method: "POST" });
}

// T004: admin book catalog & inventory management — see
// specs/003-admin-book-mgmt/contracts/admin-api.md
export interface AdminBook {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  quantityTotal: number;
  quantityAvailable: number;
  createdAt: string;
}

export interface ListAdminBooksResult {
  books: AdminBook[];
  limit: number;
  offset: number;
  total: number;
}

// Lists the catalog via the existing public GET /books endpoint (unauthenticated, but the
// shared `request()` helper's Authorization header is harmless here) — there is no separate
// admin-only listing endpoint, since the public catalog list already returns every book.
export async function listAdminBooks(
  params: { limit?: number; offset?: number } = {},
): Promise<ApiResult<ListAdminBooksResult | { error: string }>> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();
  return request(`/books${qs ? `?${qs}` : ""}`);
}

export interface CreateBookInput {
  title: string;
  author: string;
  isbn?: string;
  description?: string;
  quantityTotal: number;
}

export async function createBook(
  input: CreateBookInput,
): Promise<ApiResult<AdminBook | { error: string }>> {
  return request("/admin/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface UpdateBookInput {
  title?: string;
  author?: string;
  isbn?: string | null;
  description?: string | null;
}

export async function updateBook(
  id: string,
  input: UpdateBookInput,
): Promise<ApiResult<AdminBook | { error: string }>> {
  return request(`/admin/books/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteBook(
  id: string,
): Promise<ApiResult<{ error: string } | Record<string, never>>> {
  return request(`/admin/books/${id}`, { method: "DELETE" });
}

export async function adjustBookQuantity(
  id: string,
  delta: number,
): Promise<ApiResult<AdminBook | { error: string }>> {
  return request(`/admin/books/${id}/quantity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta }),
  });
}

// T012: admin loan oversight — see specs/005-admin-loan-oversight/contracts/admin-api.md
export type AdminReservationStatus =
  | "pending"
  | "confirmed"
  | "checked_out"
  | "return_requested"
  | "returned"
  | "cancelled";

export interface AdminReservation {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  userId: string;
  userEmail: string;
  status: AdminReservationStatus;
  requestedDate: string;
  agreedDate: string | null;
  checkedOutAt: string | null;
  returnedAt: string | null;
  forceReturnRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListAdminReservationsFilters {
  status?: AdminReservationStatus;
  bookId?: string;
  userId?: string;
}

export async function listAdminReservations(
  filters: ListAdminReservationsFilters = {},
): Promise<ApiResult<{ reservations: AdminReservation[] } | { error: string }>> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.bookId) query.set("bookId", filters.bookId);
  if (filters.userId) query.set("userId", filters.userId);
  const qs = query.toString();
  return request(`/admin/reservations${qs ? `?${qs}` : ""}`);
}

export async function confirmReturn(
  id: string,
): Promise<ApiResult<{ reservation: AdminReservation } | { error: string }>> {
  return request(`/admin/reservations/${id}/confirm-return`, { method: "POST" });
}

export async function forceReturn(
  id: string,
): Promise<ApiResult<{ reservation: AdminReservation } | { error: string }>> {
  return request(`/admin/reservations/${id}/force-return`, { method: "POST" });
}
