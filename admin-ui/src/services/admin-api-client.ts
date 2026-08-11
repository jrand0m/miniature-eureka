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
