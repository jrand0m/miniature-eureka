// T023: admin-only gate — wraps require-auth, additionally checking role. Exported as an
// array of two middlewares (verify token, then check role) so each keeps Hono's plain
// `Next` typing instead of trying to nest one middleware's control flow inside another's.
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "./require-auth";

const requireAdminRole: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
};

export const requireAdminToken: MiddlewareHandler<AppEnv>[] = [requireAuth, requireAdminRole];
