// T010: generic bearer-token auth middleware. Any authenticated user (any role) passes;
// role-specific gating (e.g. admin-only) is layered on top — see require-admin-token.ts.
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { verifyToken } from "../services/tokens";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const payload = await verifyToken(token, c.env.TOKEN_SIGNING_SECRET);
  if (!payload) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("user", payload);
  await next();
};
