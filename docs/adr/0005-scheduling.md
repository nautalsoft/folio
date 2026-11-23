# ADR 0005: Scheduling the daily book

Status: accepted (2026-11-23)

## Context

The day's book is published at a chosen local time (default 18:00, `Europe/Paris`). Folio runs either as a long-lived Node server (Docker, a VM) or as serverless functions (Vercel), where nothing runs between requests. Some users also already have an orchestrator or CI that should decide when to publish.

## Decision

- **Self-hosted:** a Nitro plugin (`server/plugins/scheduler.ts`) checks every minute. Once the local time passes the publication time and today's book isn't published yet, it runs the day. `FOLIO_SCHEDULER=false` turns it off.
- **Vercel:** the plugin is disabled; a cron in `vercel.json` calls `GET /api/cron/digest`. Hobby plans only allow a daily cron with no guaranteed minute, so by default the endpoint ignores the configured time and publishes when called. On Pro, `FOLIO_CRON_HOURLY=true` makes it wait for the configured time, for an hourly schedule.
- **Any orchestrator:** `POST /api/automation/run` runs a day on demand, as often as needed.
- **A run is idempotent per day** (`server/folio/digest.ts`): collect every enabled source, compile, publish. Running again updates the same book and increments its version. A failed source marks the book incomplete (HTTP 207). An empty day is not published (HTTP 422) and sends `digest.failed`.

## Consequences

- The same behavior everywhere, with three triggers that can coexist: an orchestrator can publish at noon and again at 18:00, and the cron becomes a no-op once the book is published.
- Late data is handled by running again, or by regenerating the book from the reader, not by special cases.
- The scheduler and the cron publish once per day; updates after that need an explicit run.
- With several self-hosted replicas, each one runs the scheduler; set `FOLIO_SCHEDULER=false` on all but one.
