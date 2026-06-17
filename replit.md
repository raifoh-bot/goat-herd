# MyGoatHerd

## Overview

A practical goat herd management application. Users can track goats, manage individual records with breed, breeding pedigree (dam, sire, grandparents), health status, lactation status, milk production, date of birth (age auto-calculated), and notes — plus a full breeding workflow: record breedings, confirm pregnancies, and log kidding outcomes (doe/buck/DOA) with birth weights.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + Wouter (routing)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Data Model

- **Goats** (`goats`): id, name, damName, sireName, maternalGranddamName, maternalGrandsireName, paternalGranddamName, paternalGrandsireName, dateOfBirth, breed, status (healthy/watch/treatment/dry), milkPerDay, lactationStatus (milking/dry/pregnant/kid), age (legacy), description, imageUrl, createdAt, updatedAt
- **Breedings** (`breedings`): id, doeId (FK→goats), sireName, breedingDate, expectedKiddingDate, status (bred/confirmed-pregnant/kidded/open), notes, createdAt, updatedAt
- **Kids** (`kids`): id, breedingId (FK→breedings), name, sex (doe/buck/doa), birthDate, birthWeight, notes, createdAt, updatedAt

## API Endpoints

### Goats
- `GET /api/goats` — list goats with optional status/breed filters
- `POST /api/goats` — create a new dairy goat
- `GET /api/goats/:id` — get single goat
- `PUT /api/goats/:id` — update a goat
- `DELETE /api/goats/:id` — delete a goat

### Breedings
- `GET /api/breedings` — list all breeding records (with doe info joined)
- `POST /api/breedings` — record a new breeding (auto-sets doe to pregnant)
- `GET /api/breedings/:id` — get breeding detail with doe and kids
- `PUT /api/breedings/:id` — update breeding status/notes
- `POST /api/breedings/:id/kids` — record kidding outcomes (auto-sets doe to milking)

### Dashboard
- `GET /api/dashboard/summary` — herd totals, health counts, lactation counts, avg milk production
- `GET /api/dashboard/breed-breakdown` — goat counts by breed
- `GET /api/dashboard/recent-activity` — recently updated goats

### Auth & Users
- `POST /api/auth/login` — log in with username/password (public; creates a session)
- `POST /api/auth/logout` — destroy the current session
- `GET /api/auth/me` — get the currently authenticated user
- `GET /api/users` — list users (Admin/Owner only)
- `POST /api/users` — create a user (Admin/Owner only)
- `PUT /api/users/:id` — update a user's role or active status (Admin/Owner only)

## Authentication & Roles

- Username/password auth with server-side sessions (express-session + connect-pg-simple, stored in the `user_sessions` table). Passwords are hashed with bcrypt. No external auth provider.
- Sessions are rolling with an idle timeout (default 7 days, override via `SESSION_IDLE_TIMEOUT_MS`). Requires `SESSION_SECRET`. Cookie security follows `NODE_ENV` (secure in production) unless `SESSION_COOKIE_SECURE` is set explicitly.
- All `/api` routes except `/api/health*` and `/api/auth/login` require authentication.
- **Roles**: `admin` and `owner` have full access (identical). `farmhand` is read-only on goats/breedings/semen but CAN record breedings, kiddings, and breeding events; cannot delete anything or manage users.
- Role enforcement is server-side via `requireAuth` + `requireRole` middleware. The frontend `AuthGuard` redirects unauthenticated users to `/login`.

## Seeding the First Admin

One-time admin seed reads `ADMIN_USERNAME` and `ADMIN_PASSWORD` (password ≥ 8 chars). It is idempotent — it never overwrites an existing user.

```
ADMIN_USERNAME=youruser ADMIN_PASSWORD=yourpassword pnpm --filter @workspace/scripts run seed-admin
```

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run test` — run API integration tests
- `pnpm --filter @workspace/scripts run seed-admin` — seed the first admin user (reads ADMIN_USERNAME/ADMIN_PASSWORD)

## Frontend Pages

- `/` — Dashboard (stats, top producer, breed breakdown)
- `/goats` — Herd list with filtering by status/breed
- `/goats/new` — Add a new goat form
- `/goats/:id` — Goat detail with pedigree and breeding history
- `/breedings` — Breeding records list (active/past sections)
- `/breedings/new` — Record a new breeding form (auto-calculates ~150 day kidding date)
- `/breedings/:id` — Breeding detail with status updates and kidding recording dialog
- `/login` — Login page (public; outside the AuthGuard)
- `/admin/users` — User management: add users, change roles, activate/deactivate (Admin/Owner only)
