import type { RequestHandler } from "express";
import * as signature from "cookie-signature";

/**
 * Bridges bearer-token auth onto express-session.
 *
 * The Replit dev preview renders the app inside a cross-site iframe, where
 * browsers block the third-party session cookie outright — so cookie auth is
 * unusable there. To work around this, the login endpoint returns the session
 * id as a token; the web client stores it in localStorage (first-party to the
 * iframe origin) and sends it as `Authorization: Bearer <sessionId>`.
 *
 * This middleware runs BEFORE express-session and, when such a header is present
 * and no session cookie already exists, signs the token exactly the way
 * express-session signs its cookie and injects it into `req.headers.cookie`.
 * express-session then validates and loads the session normally, so the whole
 * session store / expiry / rolling machinery is reused unchanged. A genuine
 * session cookie (production, same-site) always takes precedence.
 */
export function bearerToSessionCookie(cookieName: string): RequestHandler {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set to validate bearer session tokens.");
  }

  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length).trim();
      const hasSessionCookie = req.headers.cookie?.includes(`${cookieName}=`);
      if (token && !hasSessionCookie) {
        const signed = `s:${signature.sign(token, secret)}`;
        const cookie = `${cookieName}=${encodeURIComponent(signed)}`;
        req.headers.cookie = req.headers.cookie ? `${req.headers.cookie}; ${cookie}` : cookie;
      }
    }
    next();
  };
}
