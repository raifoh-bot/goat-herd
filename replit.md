# Fairy Goat Herd Manager

## Overview

A whimsical fairy goat herd management application. Users can track their enchanted fairy goats, manage individual goats with magical attributes (elemental alignment, wing type, magic level), and monitor herd health and stats via a dashboard.

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

- **Goats**: id, name, element (fire/water/earth/air/light/shadow), status (healthy/sick/resting/enchanted), magicLevel (1-100), wingType (butterfly/dragonfly/moth/feathered/crystal/none), age, description, imageUrl, createdAt, updatedAt

## API Endpoints

- `GET /api/goats` — list goats with optional status/element filters
- `POST /api/goats` — create a new fairy goat
- `GET /api/goats/:id` — get single goat
- `PUT /api/goats/:id` — update a goat
- `DELETE /api/goats/:id` — delete a goat
- `GET /api/dashboard/summary` — herd totals, status counts, avg magic level
- `GET /api/dashboard/element-breakdown` — goat counts by element
- `GET /api/dashboard/recent-activity` — recently updated goats

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
