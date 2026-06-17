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
  const store = new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  });

  const isProduction = process.env.NODE_ENV === "production";

  // Secure cookies are required over HTTPS in production but break plain-HTTP
  // test clients (e.g. supertest), so allow an explicit override.
  const secureCookies =
    process.env.SESSION_COOKIE_SECURE !== undefined
      ? process.env.SESSION_COOKIE_SECURE === "true"
      : isProduction;

  const options: SessionOptions = {
    store,
    name: "mygoatherd.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      maxAge: resolveIdleTimeout(),
    },
  };

  return session(options);
}
