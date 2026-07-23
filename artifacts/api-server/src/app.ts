import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  createSessionMiddleware,
  SESSION_COOKIE_NAME,
  isBearerBridgeEnabled,
} from "./lib/session";
import { bearerToSessionCookie } from "./middlewares/bearerToken";

const app: Express = express();

// Trust the Replit reverse proxy so secure cookies and req.secure work correctly.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS: the Expo mobile preview is served from a different origin than the
// API proxy, and the shared fetch layer sends `credentials: "include"`.
// Credentialed requests are incompatible with the wildcard `*` origin, so we
// reflect the caller's origin — but only for trusted Replit/localhost hosts.
const TRUSTED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https:\/\/[^/]+\.(replit\.dev|replit\.app|repl\.co)$/;
app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/non-browser requests carry no Origin header — allow them.
      if (!origin || TRUSTED_ORIGIN_RE.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Bridge bearer tokens onto express-session before it runs, so clients whose
// session cookie is blocked (the cross-site Replit preview iframe) can still
// authenticate via the Authorization header. Only enabled outside production —
// published apps are served same-site and use HttpOnly cookies exclusively.
if (isBearerBridgeEnabled()) {
  app.use(bearerToSessionCookie(SESSION_COOKIE_NAME));
}
app.use(createSessionMiddleware());

app.use("/api", router);

export default app;
