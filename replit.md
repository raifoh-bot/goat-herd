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

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Frontend Pages

- `/` — Dashboard (stats, top producer, breed breakdown)
- `/goats` — Herd list with filtering by status/breed
- `/goats/new` — Add a new goat form
- `/goats/:id` — Goat detail with pedigree and breeding history
- `/breedings` — Breeding records list (active/past sections)
- `/breedings/new` — Record a new breeding form (auto-calculates ~150 day kidding date)
- `/breedings/:id` — Breeding detail with status updates and kidding recording dialog
