import session, { type SessionOptions } from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";

const DEFAULT_IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function resolveIdleTimeout(): number {
  const raw = process.env.SESSION_IDLE_TIMEOUT_MS;
  if (!raw) return DEFAULT_IDLE_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_TIMEOUT_MS;
}

export function createSessionMiddleware(): RequestHandler {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET must be set to sign session cookies. Did you forget to configure it?",
    );
  }

  const PgStore = connectPgSimple(session);
  // Do NOT use createTableIfMissing — connect-pg-simple reads a `table.sql`
  // file relative to its module dir, which breaks once the server is bundled
  // (esbuild rewrites __dirname to dist/). The table is provisioned explicitly
  // at boot via ensureSessionTable() instead.
  const store = new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: false,
  });

  // The Replit proxy serves the app over HTTPS in BOTH the dev preview and
  // production, and `trust proxy` is enabled, so secure cookies work in both.
  // We default secure ON (not just in production) because the dev preview runs
  // inside a cross-site iframe: browsers only send `sameSite: "none"` cookies
  // in that context, and `sameSite: "none"` REQUIRES `secure: true`. Plain-HTTP
  // test clients (supertest) set SESSION_COOKIE_SECURE=false to opt out.
  const secureCookies =
    process.env.SESSION_COOKIE_SECURE !== undefined
      ? process.env.SESSION_COOKIE_SECURE === "true"
      : true;

  // `none` is required for the cross-site preview iframe, but it is only valid
  // alongside a secure cookie. When secure is disabled (tests) fall back to
  // `lax`, which is fine for same-origin supertest requests.
  const sameSite: "none" | "lax" = secureCookies ? "none" : "lax";

  const options: SessionOptions = {
    store,
    name: "mygoatherd.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite,
      secure: secureCookies,
      maxAge: resolveIdleTimeout(),
    },
  };

  return session(options);
}
