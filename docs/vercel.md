# Deploying on Vercel

## 1. Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnautalsoft%2Ffolio)

The button clones the repository into your account and deploys it with no configuration. The first deployment is an **ephemeral demo**: with no database, Folio keeps its data in memory inside each function instance. Data can disappear at any time and can differ from one request to the next. Use it to look around, not to keep anything.

## 2. Add a database

1. In your project, open **Storage** and add a Postgres database from the Vercel Marketplace (Neon).
2. Connect it to the project. Neon sets `DATABASE_URL` (Folio also accepts `POSTGRES_URL`).
3. Redeploy.

Folio creates its tables on the first request. The demo library is seeded if the database is empty; set `FOLIO_DEMO=false` to skip it, or delete it in **Settings → Start from scratch**.

## 3. Protect it

In **Settings → Environment Variables**, add:

| Variable | Value |
| --- | --- |
| `FOLIO_INGEST_TOKEN` | a long random value (`openssl rand -hex 32`) |
| `CRON_SECRET` | another long random value |

Set **both**. Vercel sends `CRON_SECRET` as `Authorization: Bearer <value>` when it calls a cron path. Folio's cron endpoint accepts `CRON_SECRET`, or `FOLIO_INGEST_TOKEN` when `CRON_SECRET` is unset; but Vercel's cron only ever sends `CRON_SECRET`. With only `FOLIO_INGEST_TOKEN` set, the daily cron would get `401`.

The reading interface has no login. If your deployment is public, protect it, for example with Vercel's Deployment Protection, and make sure your agents can still reach `/api/ingest/*` and `/api/automation/*` (they carry their own token). Check Vercel's documentation for which environments and plans each protection option covers. With protection on, create a "Protection Bypass for Automation" secret in the project settings and give it to your agents as `FOLIO_PROTECTION_BYPASS`: the example scripts in `skills/examples` send it as the `x-vercel-protection-bypass` header.

## 4. AI (optional)

On Vercel, Folio uses **AI Gateway** through the deployment's OIDC token: there is no key to set. Pick the model in Settings or with `FOLIO_MODEL` (default `anthropic/claude-sonnet-5.5`). Gateway usage is billed to your Vercel team. If the gateway call fails, the book keeps the compiled text.

To use another OpenAI-compatible provider instead, set `FOLIO_AI_BASE_URL`, `FOLIO_AI_API_KEY` and `FOLIO_MODEL`.

For local development against the gateway, set `AI_GATEWAY_API_KEY` in your local `.env`.

## 5. Publication time and cron

The in-process scheduler is off on Vercel. Publication relies on the cron job declared in `vercel.json`, which calls `GET /api/cron/digest`.

- Vercel cron schedules are in **UTC**. Adjust the schedule in `vercel.json` to your time zone.
- **Hobby** plans only allow cron jobs that run once a day, and do not guarantee the minute they run. **Pro** allows more frequent schedules.
- With the default daily cron, the endpoint ignores the publication time set in Settings and publishes when called. If today's book is already published (by an earlier call, "Compile now" or `/api/automation/run`), it does nothing.
- On Pro, you can switch the schedule to hourly and set `FOLIO_CRON_HOURLY=true`: the endpoint then waits for the publication time set in Settings (in your time zone) before publishing.

You can also leave the cron as a fallback and drive runs from elsewhere with `POST /api/automation/run` (see the [README](../README.md#drive-it-from-any-orchestrator)).

## 6. Public URL

On Vercel, Folio uses `https://$VERCEL_PROJECT_PRODUCTION_URL` for absolute links in webhooks and books. Set `FOLIO_PUBLIC_URL` if you use a custom domain.

## 7. Sources

Add the variables of the collectors you want (see [sources.md](sources.md)) and redeploy. **Settings → Sources** shows which ones are configured and has a "Test" button for each. For Vercel Board on Vercel, setting `BOARD_NAME` (or `FOLIO_BOARD_TEAM`) is enough: the deployment's OIDC token is used.
