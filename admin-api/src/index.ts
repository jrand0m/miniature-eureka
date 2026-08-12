// T009: Hono app skeleton. Route modules are mounted here as each user story adds them
// (see T013, T019, T027).
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { booksRoutes } from "./routes/books";
import { adminBooksRoutes } from "./routes/admin-books";
import { reservationsRoutes } from "./routes/reservations";
import { adminReservationsRoutes } from "./routes/admin-reservations";
import { notificationsRoutes } from "./routes/notifications";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

// T032: only public-ui and admin-ui may call this API from a browser.
app.use(
  "*",
  cors({
    origin: (origin: string, c: Context<AppEnv>) => {
      const allowed = c.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim());
      return origin && allowed.includes(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.route("/auth", authRoutes);
app.route("/admin/users", usersRoutes);
app.route("/admin/books", adminBooksRoutes);
app.route("/books", booksRoutes);
// T010 + T016: reservation endpoints for any signed-in user — see routes/reservations.ts
app.route("/reservations", reservationsRoutes);
// T014: admin-only reservation endpoints — see routes/admin-reservations.ts
app.route("/admin/reservations", adminReservationsRoutes);
// T004 (006-notifications): per-user notification history/read/stream endpoints — see
// routes/notifications.ts
app.route("/notifications", notificationsRoutes);

export default app;
