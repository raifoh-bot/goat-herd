import type { UserRole } from "@workspace/db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: number;
        username: string;
        role: UserRole;
      };
    }
  }
}

export {};
