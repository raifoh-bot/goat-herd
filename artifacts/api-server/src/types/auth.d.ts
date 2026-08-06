import type { UserRole, FarmStatus, DashboardWidgetLayout } from "@workspace/db";

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
        // Contact email used by the forgot-password flow; null for legacy
        // accounts created before email became required.
        email: string | null;
        // Optional display name; null when no name is on file.
        fullName: string | null;
        // The user's personal dashboard layout override, or null to use the
        // farm-wide default.
        dashboardLayout: DashboardWidgetLayout[] | null;
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
