# ADR 0002: Storage is Postgres, or embedded PGlite

Status: accepted (2026-11-23)

## Context

Folio stores books (structured JSON), reports, facts, needs, claims, reading state and settings. It must:

- work with no setup at all, for a first look or a one-click deploy;
- persist reliably for daily use, self-hosted or on Vercel;
- keep one schema and one query layer, not two storage backends with different behavior.

## Decision

- **Postgres** whenever `DATABASE_URL` (or `POSTGRES_URL`) is set: the Docker Compose service, Neon from the Vercel Marketplace, or any server.
- Otherwise **PGlite**, Postgres compiled to WebAssembly and running inside the app process. It stores its files in `FOLIO_DATA_DIR`, or stays in memory when that is unset.
- One **Drizzle ORM** schema (`server/db/schema.ts`) for both. SQL migrations in `server/db/migrations` are bundled as server assets and applied at startup, tracked in a `folio_migrations` table.

## Consequences

- `pnpm dev` and the Vercel deploy button work with zero configuration, as an ephemeral in-memory demo.
- The same SQL runs everywhere: no SQLite dialect differences, JSONB columns behave the same.
- In-memory mode loses data on restart, and on Vercel each function instance has its own copy. The interface says so ("ephemeral demo mode") and the docs tell users to add a database.
- PGlite is single-process: an instance using `FOLIO_DATA_DIR` must not be scaled to several replicas.
- Backups are standard `pg_dump` for Postgres, a directory copy for PGlite.
