import type { TokenPayload } from "./services/tokens";

export interface Env {
  DB: D1Database;
  TOKEN_SIGNING_SECRET: string;
  ALLOWED_ORIGINS: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: TokenPayload;
  };
}
