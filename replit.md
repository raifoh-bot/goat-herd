# Dairy Goat Herd Manager

## Overview

A practical dairy goat herd management application. Users can track goats, manage individual records with breed, health status, lactation status, milk production, age, notes, and monitor herd health and production stats via a dashboard.

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

- **Goats**: id, name, breed, status (healthy/watch/treatment/dry), milkPerDay, lactationStatus (milking/dry/pregnant/kid), age, description, imageUrl, createdAt, updatedAt

## API Endpoints

- `GET /api/goats` — list goats with optional status/breed filters
- `POST /api/goats` — create a new dairy goat
- `GET /api/goats/:id` — get single goat
- `PUT /api/goats/:id` — update a goat
- `DELETE /api/goats/:id` — delete a goat
- `GET /api/dashboard/summary` — herd totals, health counts, lactation counts, avg milk production
- `GET /api/dashboard/breed-breakdown` — goat counts by breed
- `GET /api/dashboard/recent-activity` — recently updated goats

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
