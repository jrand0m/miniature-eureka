// T006: password hashing via the Workers runtime's native Web Crypto API — see
// specs/001-auth-user-management/research.md §3 for why PBKDF2 over crypto.subtle
// was chosen instead of a WASM KDF.

const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    HASH_BITS,
  );
  return toHex(derived);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const salt = toHex(saltBytes.buffer);
  const hash = await deriveHash(password, saltBytes);
  return { hash, salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const candidate = await deriveHash(password, fromHex(salt));
  if (candidate.length !== hash.length) return false;
  // Constant-time comparison to avoid leaking hash content via timing.
  let mismatch = 0;
  for (let i = 0; i < candidate.length; i++) {
    mismatch |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return mismatch === 0;
}
