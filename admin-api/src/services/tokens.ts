// T007: stateless, HMAC-signed bearer tokens — see
// specs/001-auth-user-management/research.md §4 for why there is no server-side
// sessions table (and therefore no server-side logout/revocation) in this iteration.

export type Role = "admin" | "user";

export interface TokenPayload {
  sub: string;
  role: Role;
  exp: number; // unix seconds
}

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(
  payload: { sub: string; role: Role },
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const fullPayload: TokenPayload = { ...payload, exp: now + TOKEN_TTL_SECONDS };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(fullPayload));
  const encodedPayload = base64UrlEncode(payloadBytes);
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${encodedPayload}.${encodedSignature}`;
}

export async function verifyToken(
  token: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );
  if (!valid) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  return payload;
}
