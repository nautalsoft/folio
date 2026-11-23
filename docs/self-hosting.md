# Self-hosting

Folio is a single Node server and a Postgres database. You can run it with Docker Compose, or directly with Node.

## Docker Compose

```bash
git clone https://github.com/nautalsoft/folio.git folio
cd folio
cp .env.example .env   # optional: edit it first
docker compose up -d
```

This builds the app image and starts it with a Postgres 17 service. The app listens on <http://localhost:3000>. On first start it creates its tables (migrations run automatically at startup) and seeds the fictional demo library. Set `FOLIO_DEMO=false` to skip the demo, or delete it later in **Settings → Start from scratch**.

### Data and volumes

All data lives in Postgres: books, reports, facts, needs, claims, reading state, annotations, settings. The Postgres data directory is a Docker volume declared in `docker-compose.yml`.

- `docker compose down` stops the containers and keeps the volume.
- `docker compose down -v` deletes the volume, and with it all your data.

### Backups

Dump the database with `pg_dump` from the Postgres container. The commands below assume the Postgres service is named `db` in `docker-compose.yml`; use the name from your file if it differs.

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > folio-$(date +%F).dump
```

Restore into an empty database:

```bash
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < folio-2026-11-23.dump
```

Run the dump from a daily cron and keep a few copies off the machine.

### Upgrading

```bash
git pull
docker compose up -d --build
```

Database migrations are applied automatically when the app starts. Read [CHANGELOG.md](../CHANGELOG.md) before upgrading across a major version, and take a backup first.

## Without Docker

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
pnpm build
DATABASE_URL=postgres://folio:YOUR_PASSWORD@localhost:5432/folio node .output/server/index.mjs
```

The server listens on port 3000 by default (`PORT` and `HOST` change it, as for any Nuxt/Nitro server).

### Without Postgres

If `DATABASE_URL` (or `POSTGRES_URL`) is not set, Folio uses **PGlite**, an embedded Postgres, stored in `FOLIO_DATA_DIR`:

```bash
FOLIO_DATA_DIR=/var/lib/folio node .output/server/index.mjs
```

To back it up, stop the app and copy that directory. If neither variable is set, data lives in memory and is lost on restart: fine for a demo, not for real use. PGlite runs inside the app process and suits a single instance; use Postgres if you run more than one.

## Configuration

Every variable is listed in `.env.example`; the main ones are in the [README](../README.md#make-it-yours) and the collectors' in [sources.md](sources.md). Three matter most for a server:

- **`FOLIO_INGEST_TOKEN`**: required as soon as the instance is reachable from the internet. Generate it with `openssl rand -hex 32`.
- **`FOLIO_PUBLIC_URL`**: the public base URL, for example `https://folio.example.com`. Folio uses it to build absolute links in webhooks (`book.published` and `needs_you.created` carry a link to the book or the need) and in books compiled by the scheduler. Without it, webhook links are `null` and agent report citations are relative paths.
- **`FOLIO_TIMEZONE`** and **`FOLIO_DIGEST_TIME`**: when a day starts and when its book is published. Both can be changed later in Settings.

### Scheduler

The server checks every minute whether today's book is due. Once the local time passes the publication time (default `18:00` in `Europe/Paris`), it collects every enabled source, compiles the day and publishes it, once per day. Later updates come from `POST /api/automation/run`, the "Compile now" button, or regenerating the book.

Set `FOLIO_SCHEDULER=false` if something else drives publication (an orchestrator calling `/api/automation/run`, or a system cron calling `/api/cron/digest`), or if you run several app instances and want only one to publish.

## Reverse proxy and HTTPS

Run Folio behind a reverse proxy that terminates HTTPS. The reading interface has **no login**, and its endpoints can change settings, edit books and delete all data. If the instance is reachable from the internet, put the interface behind authentication (proxy basic auth, SSO, a VPN) and leave only the token-protected machine paths open:

- `/api/ingest/*` and `/api/automation/*` (`FOLIO_INGEST_TOKEN`)
- `/api/cron/*` (`CRON_SECRET`, or `FOLIO_INGEST_TOKEN`)
- `/api/health` (for monitoring, if you need it)

Example with Caddy, which also obtains the certificate:

```caddyfile
folio.example.com {
	@machine path /api/ingest/* /api/automation/* /api/cron/* /api/health
	handle @machine {
		reverse_proxy localhost:3000
	}
	handle {
		basic_auth {
			reader <bcrypt hash from `caddy hash-password`>
		}
		reverse_proxy localhost:3000
	}
}
```

The Live page uses Server-Sent Events on `/api/live`. Caddy streams them as-is; with nginx, turn off buffering for that path:

```nginx
location /api/live {
    proxy_pass http://127.0.0.1:3000;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

## AI

Without a model, books are compiled from the facts alone and the chat answers with passage search. To have a model write the prose:

- **Vercel AI Gateway:** set `AI_GATEWAY_API_KEY`. `FOLIO_MODEL` (or Settings) picks the model, default `anthropic/claude-sonnet-5.5`, and `FOLIO_REASONING` its reasoning effort (default `minimal`).
- **Any OpenAI-compatible server** (a local inference server, a hosted provider): set `FOLIO_AI_BASE_URL` (for example `http://localhost:11434/v1`), `FOLIO_AI_API_KEY` if it needs one, and `FOLIO_MODEL` to a model name that server knows. `FOLIO_AI_BASE_URL` takes precedence over the gateway.

The writer asks the model for structured JSON. If the call fails (model unavailable, invalid output, 60-second timeout), the book keeps the compiled text and the run reports `writerError`.

## Health checks

`GET /api/health` returns `200 { "ok": true, "version": "…" }` once the database is reachable.
