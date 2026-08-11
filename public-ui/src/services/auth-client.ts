// T015: calls the Admin API's public account endpoints from the browser — the one
// runtime backend call the static Public UI is permitted to make, per Constitution
// Principle II.
const API_BASE = import.meta.env.VITE_ADMIN_API_BASE_URL;
const TOKEN_STORAGE_KEY = "library_auth_token";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export interface AuthSuccess {
  token: string;
  userId?: string;
}

export interface AuthError {
  error: string;
}

export async function register(
  email: string,
  password: string,
): Promise<ApiResult<AuthSuccess | AuthError>> {
  return postJson<AuthSuccess | AuthError>("/auth/register", { email, password });
}

// T021: login()/logout()
export async function login(
  email: string,
  password: string,
): Promise<ApiResult<AuthSuccess | AuthError>> {
  return postJson<AuthSuccess | AuthError>("/auth/login", { email, password });
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Logout is a client-side token discard regardless of network outcome —
      // see research.md §4.
    });
  }
  clearToken();
}
