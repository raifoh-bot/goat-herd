# MyGoatHerd

## Overview

A practical goat herd management application. Users can track goats, manage individual records with breed, breeding pedigree (dam, sire, grandparents), health status, lactation status, milk production, date of birth (age auto-calculated), and notes — plus a full breeding workflow: record breedings, confirm pregnancies, and log kidding outcomes (doe/buck/DOA) with birth weights.

The app is **multi-tenant**: each farm is an isolated tenant with its own goats, breedings, users, and settings. Farms self-register, and a super-admin can manage all farms.

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

All tenant tables carry a `farmId` (FK→farms) and every query is scoped to the request's farm.

- **Farms** (`farms`): id, slug (unique, used as subdomain/tenant key), name, status (active/suspended), createdAt, updatedAt
- **Goats** (`goats`): id, farmId, name, damName, sireName, maternalGranddamName, maternalGrandsireName, paternalGranddamName, paternalGrandsireName, dateOfBirth, breed, status (healthy/watch/treatment/dry), milkPerDay, lactationStatus (milking/dry/kid), breedingStatus (exposed/serviced/pregnant/retired, null = no info; auto-driven by breeding/kidding records; bucks/wethers may only carry retired), age (legacy), description, imageUrl, createdAt, updatedAt
- **Breedings** (`breedings`): id, doeId (FK→goats), sireName, breedingDate, expectedKiddingDate, status (bred/confirmed-pregnant/kidded/open), notes, createdAt, updatedAt
- **Kids** (`kids`): id, breedingId (FK→breedings), name, sex (doe/buck/doa), birthDate, birthWeight, notes, createdAt, updatedAt
- **Health Events** (`health_events`): id, farmId, goatId (FK→goats), eventType (hoof_trim/cdt_shot/copper_bolus/famacha/deworming/other), eventDate, famachaScore (1–5, only kept for famacha/deworming events), dosageMl, bodyWeight, productName, notes, createdAt. Deleting a goat deletes its health events in the same transaction.

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

### Health Events
- `GET /api/goats/:id/health-events` — list a goat's health events (newest first)
- `POST /api/goats/:id/health-events` — record a health event (farmhand allowed)
- `PUT /api/goats/:id/health-events/:eventId` — edit a health event (farmhand allowed; omitted fields unchanged, null clears; FAMACHA score auto-dropped on non-FAMACHA/deworming types)
- `DELETE /api/goats/:id/health-events/:eventId` — delete a health event (Admin/Owner only)
- `GET /api/health-events/bulk-session` — active goats eligible for a herd work day (excludes dead/sold/retired)
- `POST /api/health-events/bulk` — record a batch of events for many goats in one transaction (farmhand allowed); returns `{created}`

### Shows
- `GET /api/shows` — list shows (newest first)
- `POST /api/shows` — create a show (Admin/Owner only)
- `GET /api/shows/:id` — show detail with results (goat names joined)
- `PUT /api/shows/:id` — update a show (Admin/Owner only)
- `DELETE /api/shows/:id` — delete a show and all its results (Admin/Owner only)
- `POST /api/shows/:id/results` — batch-record result rows (Admin/Owner only; rejects cross-farm goats)
- `PUT /api/shows/:id/results/:resultId` — update a result (Admin/Owner only)
- `DELETE /api/shows/:id/results/:resultId` — delete a result (Admin/Owner only)
- `GET /api/goats/:id/accolades` — a goat's show results grouped by show, newest first

### Dashboard
- `GET /api/dashboard/summary` — herd totals, health counts, lactation counts, avg milk production
- `GET /api/dashboard/breed-breakdown` — goat counts by breed
- `GET /api/dashboard/recent-activity` — recently updated goats

### Farm Registration & Super-Admin
- `POST /api/farms/register` — public self-registration (body: slug, farmName, username, password, email). Creates the farm + its settings + the first admin user (with contact email) in one transaction.
- `GET /api/superadmin/farms` — list all farms (superadmin only)
- `POST /api/superadmin/farms` — create a farm (superadmin only)
- `PUT /api/superadmin/farms/:id` — update a farm's name/status (superadmin only)
- `GET /api/superadmin/users` — list all super-admin accounts (superadmin only)
- `POST /api/superadmin/users` — create a super-admin (username, email, password ≥ 8; superadmin only)
- `PUT /api/superadmin/users/:id` — activate/deactivate a super-admin (superadmin only; cannot deactivate yourself)
- On farm self-registration, all active super-admins with an email on file get a "new farm registered" notification email (fire-and-forget; logged instead of sent when Resend isn't configured).

### Auth & Users
- `POST /api/auth/login` — log in with username/password (public; creates a session). Scoped to the resolved farm; the super-admin logs in at the apex domain (no farm).
- `POST /api/auth/logout` — destroy the current session
- `POST /api/auth/superadmin-forgot-password` — public; emails a reset link to a super-admin (by username or email; neutral response)
- `POST /api/auth/superadmin-reset-password` — public; sets a new super-admin password from a reset token (token must belong to a farm-less superadmin)
- `PUT /api/auth/email` — self-service: any signed-in user sets/updates their own contact email (used by forgot-password). `AuthUser` (`/api/auth/me`) includes `email` (null for legacy accounts).
- `GET /api/auth/me` — get the currently authenticated user
- `GET /api/users` — list users (Admin/Owner only)
- `POST /api/users` — create a user (Admin/Owner only; email is required — used by the forgot-password flow)
- `PUT /api/users/:id` — update a user's role or active status (Admin/Owner only)

## Authentication & Roles

- Username/password auth with server-side sessions (express-session + connect-pg-simple, stored in the `user_sessions` table). Passwords are hashed with bcrypt. No external auth provider.
- Sessions are rolling with an idle timeout (default 7 days, override via `SESSION_IDLE_TIMEOUT_MS`). Requires `SESSION_SECRET`. Cookie security follows `NODE_ENV` (secure in production) unless `SESSION_COOKIE_SECURE` is set explicitly.
- All `/api` routes except `/api/health*` and `/api/auth/login` require authentication.
- **Roles**: `superadmin` is a global operator (no farm) who manages farms. `admin` and `owner` have full access within their farm (identical). `farmhand` is read-only on goats/breedings/semen but CAN record breedings, kiddings, breeding events, and health events (single and bulk); cannot delete anything or manage users. `superadmin` cannot be assigned via the user-management API (it's created by seeding only); `requireRole` grants superadmin a bypass on farm-scoped role checks.
- Role enforcement is server-side via `requireAuth` + `requireRole` middleware. The frontend `AuthGuard` redirects unauthenticated users to `/login`.

## Multi-Tenancy

- Every tenant table has a `farmId`; all reads/writes are scoped to the request's farm via the `farmId()` helper. Cross-farm access returns 404 (the row simply isn't in the tenant's scope).
- **Path-based farm URLs**: each farm lives at `mygoatherd.com/<slug>/...` on a
  single domain (no per-farm subdomain/DNS). The frontend derives the farm slug
  from the first URL path segment (`src/lib/farm.ts`), mounts the wouter router
  under `/<slug>`, and sources the `X-Farm-Slug` header from it. Root paths
  (`/login`, `/register`, `/superadmin/*`) have no farm prefix. Reserved words
  (route/platform words like `login`, `goats`, `admin`, `api`) can't be farm slugs
  — defined once in the shared `@workspace/reserved-slugs` lib and consumed by
  both `createFarm.ts` (server) and `farm.ts` (client), so adding a new route
  word updates both automatically.
- **Tenant resolution** (`resolveTenant` middleware), in order:
  1. **Subdomain** — only when `FARM_BASE_DOMAIN` is set, e.g. `acme.example.com` → farm slug `acme`. Left in place but unused under path-based URLs.
  2. **`X-Farm-Slug` header** — sent by the frontend, sourced from the URL slug (and by tooling/tests).
  3. **`session.farmSlug`** — persisted on login (used when no header is sent, e.g. the root landing redirect).
- Login persists `farmSlug` on the session; `requireAuth` verifies the authenticated user belongs to the resolved farm.
- Existing pre-multi-tenant data is migrated into a `default` farm by the idempotent boot DDL (`ensureMultiTenant`). `default` is a reserved slug and cannot be self-registered.
- Username uniqueness is **per-farm** (partial unique index on `(farm_id, username)`), plus a separate partial unique index on `username WHERE farm_id IS NULL` for super-admins. The legacy global `users` username unique constraint is dropped at boot.

## Seeding the First Admin

One-time admin seed reads `ADMIN_USERNAME` and `ADMIN_PASSWORD` (password ≥ 8 chars). It is idempotent — it never overwrites an existing user.

```
ADMIN_USERNAME=youruser ADMIN_PASSWORD=yourpassword pnpm --filter @workspace/scripts run seed-admin
```

The seeded admin is attached to the `default` farm.

## Seeding the Super-Admin

The global super-admin (no farm) is seeded from `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD` (password ≥ 8 chars), both at boot and via a script. Idempotent — never overwrites an existing user.

```
SUPERADMIN_USERNAME=youruser SUPERADMIN_PASSWORD=yourpassword pnpm --filter @workspace/scripts run seed-superadmin
```

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run test` — run API integration tests
- `pnpm --filter @workspace/scripts run seed-admin` — seed the first admin user in the default farm (reads ADMIN_USERNAME/ADMIN_PASSWORD)
- `pnpm --filter @workspace/scripts run seed-superadmin` — seed the global super-admin (reads SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD)

## Frontend Pages

Farm pages are served under the farm's path prefix (`/<slug>/...`); the paths
below are relative to that prefix. Root pages (`/login`, `/register`,
`/superadmin/farms`) have no prefix. A farm member signs in at `/<slug>/login`
(no Farm field); the root `/login` keeps a Farm field as a fallback that
redirects to `/<slug>/...`.

- `/` — Dashboard (stats, top producer, breed breakdown)
- `/goats` — Herd list with filtering by status/breed
- `/goats/new` — Add a new goat form
- `/goats/:id` — Goat detail with pedigree and breeding history; does with recorded kiddings also get a compact Kidding History card (date, sire, kids born per kidding; rows link to the breeding). Helpers shared with the pedigree certificate live in `src/lib/kidding.ts`.
- `/breedings` — Breeding records list (active/past sections)
- `/breedings/new` — Record a new breeding form (auto-calculates ~150 day kidding date)
- `/breedings/:id` — Breeding detail with status updates and kidding recording dialog
- `/health-events/new` — "Herd Work Day" 3-step bulk wizard (pick goats → pick tasks → FAMACHA scores & review); FAMACHA scores at/above the farm threshold suggest an extra deworming event per goat (opt-out). Linked from the sidebar and a "Log Herd Work Day" button on the herd list. The goat detail page has a Health History card with an ad hoc "Add Event" dialog. The farm settings page has a FAMACHA threshold setting (1–5, default 3, `famachaThreshold` in farm settings).
- `/reports` — Reports hub (cards for Lineage Report, Barn Worksheet, Pedigree Certificate, Health History Report, Enter Show Results, Show Time)
- `/reports/show-results` — Show results worksheet: list of shows, create/edit/delete a show (name, location, date, notes), and per-goat result rows (searchable goat picker; judge, class/division, placement dropdown, award/ribbon, notes; batch save). Admin/Owner can edit; farmhands view-only. `?show=<id>` opens one show. Goat detail pages show an Accolades card (results grouped by show, hidden when empty).
- `/reports/health-history` — Printable per-goat health record (`?goat=<id>`): identity section (name, breed, sex, DOB/age, status, lactation status) + chronological health events table (oldest first). No lineage — suited to buyers of unregistered goats. Linked from the goat detail page next to the Pedigree Certificate button.
- `/reports/barn-worksheet` — Printable work day worksheet: filter/select goats (breed, sex, herd status; select-all + per-goat checkboxes, defaults to all on-farm goats), then print one table (alphabetical, one row per goat) with pre-filled identity columns and blank hand-write columns (FAMACHA, deworming, hoof trim, CDT, copper bolus, weight, notes). Landscape `@page`, repeating `<thead>`, work-day date and recorded-by blanks, `ReportHeader` on print.
- `/login` — Login page (public; outside the AuthGuard)
- `/register` — Public farm self-registration (creates a farm + first admin)
- `/superadmin/farms` — Super-admin panel: list/create farms and toggle active/suspended (superadmin only)
- `/superadmin/users` — Super-admin accounts: list/create super-admins and activate/deactivate them (superadmin only; Farms/Users tab nav shared across the panel)
- `/superadmin/forgot-password` / `/superadmin/reset-password` — public super-admin password recovery pages; the root `/login` "Forgot your password?" link points here when no farm context
- `/admin/users` — User management: add users, change roles, activate/deactivate (Admin/Owner only)
