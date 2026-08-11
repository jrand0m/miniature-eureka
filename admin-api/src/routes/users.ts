import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAdminToken } from "../middleware/require-admin-token";
import { findById, listUsers, setEnabled } from "../services/users";

export const usersRoutes = new Hono<AppEnv>();

usersRoutes.use("*", ...requireAdminToken);

// T024: GET /admin/users — see contracts/admin-api.md
usersRoutes.get("/", async (c) => {
  const users = await listUsers(c.env.DB);
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      registeredAt: u.registeredAt,
      lastLoginAt: u.lastLoginAt,
      enabled: u.enabled,
    })),
  });
});

// T025: POST /admin/users/:id/disable
usersRoutes.post("/:id/disable", async (c) => {
  const id = c.req.param("id");
  const target = await findById(c.env.DB, id);
  if (!target) {
    return c.json({ error: "not_found" }, 404);
  }
  if (target.role === "admin") {
    // FR-013 — the sole administrator can never be disabled, by anyone, including itself.
    return c.json({ error: "cannot_disable_admin" }, 409);
  }
  await setEnabled(c.env.DB, id, false);
  return c.body(null, 204);
});

// T026: POST /admin/users/:id/enable
usersRoutes.post("/:id/enable", async (c) => {
  const id = c.req.param("id");
  const target = await findById(c.env.DB, id);
  if (!target) {
    return c.json({ error: "not_found" }, 404);
  }
  await setEnabled(c.env.DB, id, true);
  return c.body(null, 204);
});
