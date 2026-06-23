import type { UserRole, FarmStatus } from "@workspace/db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    // The slug of the farm the user authenticated against. Used to re-resolve
    // the tenant on subsequent requests in dev (where there is no subdomain).
    farmSlug?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: number;
        username: string;
        role: UserRole;
        // null for superadmin accounts (which are not bound to a farm).
        farmId: number | null;
      };
      // The resolved tenant for this request, if any. Populated by resolveTenant.
      farm?: {
        id: number;
        slug: string;
        name: string;
        status: FarmStatus;
      };
    }
  }
}

export {};
