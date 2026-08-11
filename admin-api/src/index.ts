// T009: Hono app skeleton. Route modules are mounted here as each user story adds them
// (see T013, T019, T027).
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { booksRoutes } from "./routes/books";

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
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.route("/auth", authRoutes);
app.route("/admin/users", usersRoutes);
app.route("/books", booksRoutes);

export default app;
