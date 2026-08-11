import { Hono } from "hono";
import type { AppEnv } from "../types";
import { createUser, findByEmail, updateLastLogin } from "../services/users";
import { hashPassword, verifyPassword } from "../services/password";
import { signToken } from "../services/tokens";
import { requireAuth } from "../middleware/require-auth";

export const authRoutes = new Hono<AppEnv>();

interface RegisterBody {
  email?: unknown;
  password?: unknown;
}

// T012: POST /auth/register — see contracts/admin-api.md
authRoutes.post("/register", async (c) => {
  const body = await c.req.json<RegisterBody>().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const existing = await findByEmail(c.env.DB, email);
  if (existing) {
    return c.json({ error: "email_already_registered" }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const user = await createUser(c.env.DB, { email, passwordHash: hash, passwordSalt: salt });
  const token = await signToken({ sub: user.id, role: user.role }, c.env.TOKEN_SIGNING_SECRET);

  return c.json({ token, userId: user.id }, 201);
});

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

// T017: POST /auth/login — see contracts/admin-api.md
authRoutes.post("/login", async (c) => {
  const body = await c.req.json<LoginBody>().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const user = await findByEmail(c.env.DB, email);
  const passwordMatches = user ? await verifyPassword(password, user.passwordHash, user.passwordSalt) : false;
  if (!user || !passwordMatches) {
    // Generic failure — never reveals whether the email or the password was wrong (FR-007).
    return c.json({ error: "invalid_credentials" }, 401);
  }

  if (!user.enabled) {
    // Distinct from invalid_credentials — see spec.md Edge Cases.
    return c.json({ error: "account_disabled" }, 403);
  }

  await updateLastLogin(c.env.DB, user.id);
  const token = await signToken({ sub: user.id, role: user.role }, c.env.TOKEN_SIGNING_SECRET);
  return c.json({ token }, 200);
});

// T018: POST /auth/logout — gated by require-auth; a client-side token discard is the
// actual "logout" (see research.md §4), this just confirms the caller held a valid token.
authRoutes.post("/logout", requireAuth, (c) => {
  return c.body(null, 204);
});
