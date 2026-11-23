# HTTP API

This reference follows the validation schemas in `server/utils/ingest.ts` and the handlers in `server/api/`. All bodies are JSON (`Content-Type: application/json`). Examples use two environment variables:

```bash
export FOLIO_URL=https://folio.example.com
export FOLIO_INGEST_TOKEN=YOUR_TOKEN
```

- [Authentication](#authentication)
- [Conventions](#conventions)
- [Ingest](#ingest): [report](#post-apiingestreport), [facts](#post-apiingestfacts), [needs](#post-apiingestneeds), [work](#get-apiingestwork), [activity](#post-apiingestactivity)
- [Automation](#automation): [run](#post-apiautomationrun), [status](#get-apiautomationstatus), [cron](#get-apicrondigest)
- [Webhooks](#webhooks)
- [Other endpoints](#other-endpoints)

## Authentication

| Endpoints | Token | Header |
| --- | --- | --- |
| `/api/ingest/*`, `/api/automation/*` | `FOLIO_INGEST_TOKEN` | `Authorization: Bearer <token>` |
| `/api/cron/digest` | `CRON_SECRET`, or `FOLIO_INGEST_TOKEN` if `CRON_SECRET` is unset | `Authorization: Bearer <token>` |
| Everything else | none | — |

When the token variable is not set, the endpoint is open. When it is set, a missing or wrong token returns `401`. Tokens are compared in constant time.

The other endpoints serve the reading interface. They have no authentication of their own; protect a public instance at the proxy or platform level (see [ADR 0004](adr/0004-no-accounts-single-reader.md)).

## Conventions

- **Days** are `YYYY-MM-DD` in the instance's time zone (Settings, default `FOLIO_TIMEZONE`, default `Europe/Paris`). When `day` is omitted, it is today in that time zone.
- **Agent references** (`agent`) are either a string (`"atlas"`) or an object:

  | Field | Type | Limits |
  | --- | --- | --- |
  | `id` | string, required | 1–60 chars |
  | `name` | string | max 80 chars. Defaults to the id the first time the agent is seen. |
  | `kind` | `t3code` \| `claude-code` \| `codex` \| `grok` \| `cloud` \| `other` | default `other` |

  The id is normalized: accents removed, lowercased, every run of characters other than `a-z0-9` replaced by `-`, trimmed of `-`, cut to 48 chars. `"Atlas Bot"` becomes `atlas-bot`. Sending `name` or `kind` later updates the agent.
- **Source names** (`source`) are 1–40 chars, normalized the same way (`"Linear"` becomes `linear`). The six built-in names are `board`, `github`, `vercel`, `slack`, `clickup` and `notion`; any other name creates its own source.
- **Statuses** of work are `done`, `blocked`, `waiting` (on a person) or `info`.
- **URLs** must start with `http://`, `https://` or `/` (a path on this instance), max 2000 chars.
- **Timestamps** are ISO 8601 with an offset (`2026-11-23T14:05:00Z` or `2026-11-23T15:05:00+01:00`).
- **Errors** are JSON. A body that fails validation returns `400` with the validation issues.

---

## Ingest

### `POST /api/ingest/report`

An agent reports what it did. A report becomes part of the agent's chapter for that day.

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `agent` | agent reference | required | |
| `day` | `YYYY-MM-DD` | today | |
| `key` | string | none | max 200. Idempotency key: the same agent sending the same key updates the existing report. Without it, every call creates a new report. |
| `project` | string | none | max 120 |
| `title` | string | required | 1–300 |
| `summary` | string | `""` | max 8000. Becomes the chapter's paragraph for this report. |
| `status` | status | `done` | Used for the chapter status only when there are no items. |
| `items` | array | `[]` | max 100, see below |
| `needs` | array | `[]` | max 20, same shape as [needs](#post-apiingestneeds) |

Each item:

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `text` | string | `""` | max 2000. Becomes a fact line when not empty. |
| `status` | status | `info` | |
| `url` | URL | none | Becomes the item's own citation. Without it, the item cites the report page. |
| `label` | string | the URL | max 200. Link text of the citation. |
| `code` | `{ lang, code }` | none | `lang` max 30, default `text`; `code` max 20000 |
| `diff` | `{ file, patch }` | none | `file` max 300; `patch` (unified diff) max 40000 |
| `steps` | array of `{ label, status, detail? }` | none | max 50; `label` max 300; `status` is `done`, `error`, `running` or `skipped`; `detail` max 1000 |

**Response `201`:**

```json
{ "id": "r_3f2a9c0d1e4b5a6c", "day": "2026-11-23", "url": "/reports/r_3f2a9c0d1e4b5a6c" }
```

Needs in the report are created or updated (keyed by agent and `key`), and a `needs_you.created` webhook is sent for each new one.

```bash
curl -X POST "$FOLIO_URL/api/ingest/report" \
  -H "Authorization: Bearer $FOLIO_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "agent": { "id": "atlas", "name": "Atlas", "kind": "claude-code" },
    "key": "phare-rate-limit",
    "project": "Phare",
    "title": "Rate limit for the public API",
    "summary": "60 requests per minute per key, with Retry-After.",
    "items": [
      { "text": "Rate-limit middleware", "status": "done", "url": "https://github.com/example/phare/pull/57", "label": "PR #57",
        "diff": { "file": "server/middleware/rate-limit.ts", "patch": "@@ -1 +1,3 @@\n-export default defineEventHandler(() => {})\n+export default defineEventHandler(async (event) => {\n+  // ...\n+})" } },
      { "text": "Test suite", "status": "done",
        "steps": [ { "label": "unit", "status": "done" }, { "label": "e2e", "status": "done", "detail": "42 passed" } ] }
    ]
  }'
```

### `POST /api/ingest/facts`

Any tool pushes facts under a source name. Facts not attributed to an agent go into that source's chapter; the source appears in the book's "Sources" chapter.

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `source` | source name | required | 1–40, normalized |
| `day` | `YYYY-MM-DD` | today | |
| `run` | `{ status, message? }` | `{ "status": "ok" }` | `status` is `ok` or `error`; `message` max 300. An `error` marks the day's book incomplete. |
| `facts` | array | `[]` | max 500, see below |

Each fact:

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `id` | string | required | 1–200. Your stable id for the record. Facts are upserted by `(source, id, day)`. |
| `kind` | string | `item` | max 40, free-form (`issue`, `message`…) |
| `status` | status | `info` | |
| `title` | string | required | 1–500 |
| `body` | string | `""` | max 2000 |
| `url` | URL | required | The citation link. |
| `label` | string | source title | max 200. Citation link text. |
| `actor` | string | none | max 120. Who did it, in the source's terms. Matched to an agent through `FOLIO_AGENT_ALIASES`, or when it equals an agent id. |
| `agent` | string | none | max 60. Agent id (normalized). Puts the fact in that agent's chapter; creates the agent if needed. Takes precedence over `actor`. |
| `project` | string | none | max 120 |
| `occurredAt` | timestamp | now | |

Every call also records a run for that source and day (`count` = number of facts sent). The book shows the latest run per source. An empty `facts` array with `run.status: "ok"` records that the source was read and had nothing.

**Response `201`:**

```json
{ "day": "2026-11-23", "source": "linear", "accepted": 2 }
```

```bash
curl -X POST "$FOLIO_URL/api/ingest/facts" \
  -H "Authorization: Bearer $FOLIO_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "source": "linear",
    "facts": [
      { "id": "ENG-482", "kind": "issue", "status": "done", "title": "Retry failed exports", "url": "https://linear.app/example/issue/ENG-482", "actor": "atlas", "project": "Phare" }
    ]
  }'
```

Reporting a failure:

```bash
curl -X POST "$FOLIO_URL/api/ingest/facts" \
  -H "Authorization: Bearer $FOLIO_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{ "source": "linear", "run": { "status": "error", "message": "API returned 503" } }'
```

### `POST /api/ingest/needs`

An agent raises items that need a person: a decision, a blocker or a review. They appear on the "Needs you" page and at the front of the next book.

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `agent` | agent reference | required | |
| `needs` | array | required | 1–20, see below |

Each need:

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `key` | string | required | 1–200. Stable per agent: sending the same key again updates the need and reopens it if it was resolved. |
| `kind` | `decision` \| `blocker` \| `review` | `decision` | |
| `title` | string | required | 1–500 |
| `detail` | string | `""` | max 2000 |
| `url` | URL | none | Where to act. |
| `deadline` | timestamp | none | Needs are sorted by deadline. |
| `blocking` | array of strings | `[]` | max 20 items, 200 chars each. What this blocks. |

**Response `201`:**

```json
{ "ids": ["n_8b1c2d3e4f5a6b7c"] }
```

A `needs_you.created` webhook is sent once per new need.

```bash
curl -X POST "$FOLIO_URL/api/ingest/needs" \
  -H "Authorization: Bearer $FOLIO_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "agent": "ecume",
    "needs": [
      { "key": "deploy-thursday", "kind": "decision", "title": "Go for the production deploy on Thursday?",
        "detail": "Staging is green, 212 tests passed.", "deadline": "2026-11-26T12:00:00+01:00", "blocking": ["Customer announcement"] }
    ]
  }'
```

### `GET /api/ingest/work`

Who holds which task.

| Query | Meaning |
| --- | --- |
| none | List every open, claimed or released task. |
| `key` | Look up one task by the key used in `POST /api/ingest/work`, or by its work item id. |

**Response without `key`:** `{ "items": WorkItem[] }`.

**Response with `key`:**

```json
{ "item": null, "free": true }
```

`free` is `true` when the task is unknown, finished, not claimed, or its claim is stale. A `WorkItem` (see `shared/types/folio.ts`):

```json
{
  "id": "w_0a1b2c3d4e5f6a7b",
  "title": "Synonyms in search",
  "project": "Herbier",
  "source": "agent",
  "sourceUrl": null,
  "claimedBy": "atlas",
  "claimedByName": "Atlas",
  "claimedAt": "2026-11-23T09:12:00.000Z",
  "heartbeatAt": "2026-11-23T10:40:00.000Z",
  "status": "claimed",
  "stale": false,
  "previousClaim": null,
  "checkpoints": [
    { "id": "k_…", "note": "Synonym table created", "step": "1/3", "resumeHint": null, "createdAt": "…", "agentId": "atlas" }
  ]
}
```

A claim is **stale** when its last heartbeat is more than 30 minutes old.

```bash
curl "$FOLIO_URL/api/ingest/work?key=herbier-synonyms" -H "Authorization: Bearer $FOLIO_INGEST_TOKEN"
```

### `POST /api/ingest/work`

Claim, heartbeat, checkpoint, release or finish a task.

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `agent` | agent reference | required | |
| `action` | `claim` \| `heartbeat` \| `checkpoint` \| `release` \| `done` | required | |
| `task.key` | string | required | 1–200. Your stable task key. |
| `task.title` | string | the key | max 500 |
| `task.project` | string | none | max 120 |
| `task.url` | URL | none | |
| `task.source` | source name | `agent` | |
| `checkpoint` | `{ note, step?, resumeHint? }` | none | Required for `checkpoint`. `note` 1–2000, `step` max 100 (`"2/5"`), `resumeHint` max 2000 (how to pick up from here). |
| `force` | boolean | `false` | Take over a live claim held by another agent. |

Behavior and responses:

| Action | Result |
| --- | --- |
| `claim` | `200 { "ok": true, "id", "resumeFrom" }`. `resumeFrom` is the task's last checkpoint when the task existed before, else `null`. If another agent holds a live (non-stale) claim and `force` is false: `409 { "ok": false, "reason": "claimed", "claimedBy", "claimedAt", "heartbeatAt", "checkpoint" }`. Taking over a stale or forced claim records `previousClaim`, which a person can undo from the "Who's on it" page. |
| `heartbeat` | `200 { "ok": true }`. Refreshes the claim. |
| `checkpoint` | `200 { "ok": true }`. Stores the note and refreshes the claim. `400` without `checkpoint`. |
| `release` | `200 { "ok": true }`. Frees the task. |
| `done` | `200 { "ok": true }`. Marks the task finished. |

Every action other than `claim` returns `404` for an unknown key, and `409 { "ok": false, "reason": "claimed", "claimedBy" }` when another agent holds the claim (stale or not: claim it first).

```bash
curl -X POST "$FOLIO_URL/api/ingest/work" \
  -H "Authorization: Bearer $FOLIO_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{ "agent": "atlas", "action": "checkpoint", "task": { "key": "herbier-synonyms" },
        "checkpoint": { "note": "Indexed 2400 of 6100 records", "step": "2/3", "resumeHint": "Run scripts/index-synonyms.ts --from 2400" } }'
```

### `POST /api/ingest/activity`

A free-form event for the Live feed. Activity events are not part of the book.

| Field | Type | Default | Limits / notes |
| --- | --- | --- | --- |
| `agent` | agent reference | required | |
| `type` | string | `note` | max 40 |
| `title` | string | required | 1–500 |
| `detail` | string | none | max 2000 |
| `url` | string | none | max 2000 |
| `source` | source name | `agent` | |

**Response `201`:** `{ "ok": true }`

```bash
curl -X POST "$FOLIO_URL/api/ingest/activity" \
  -H "Authorization: Bearer $FOLIO_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{ "agent": "cobalt", "type": "note", "title": "Started load test on staging" }'
```

---

## Automation

### `POST /api/automation/run`

Collect, compile and publish a day. Idempotent per day: running again updates the same book and increments its version.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `day` | `YYYY-MM-DD` | today | |
| `collect` | boolean | `true` | Read every enabled built-in source first. With `false`, only data already stored (reports, pushed facts, earlier collections) is used. |
| `publish` | boolean | `true` | With `false`, the book is compiled but its publication status is left as it was. |
| `useModel` | boolean | `true` | Write prose with the configured model, if one is available. |

An empty body (`{}`) is valid.

What happens:

1. Each built-in collector runs: `ok`, `error`, `not_configured` (missing environment variables) or `skipped` (disabled in Settings).
2. Pending `needs_you.created` webhooks are sent.
3. The day is compiled from reports, facts, needs and source runs, then rewritten by the model when available. If the model fails, the compiled text is kept and `writerError` says why.
4. If the day has content and `publish` is true, the book is published, the month's collection is updated, and `book.published` is sent. If the day is empty, the book is not published and `digest.failed` is sent.

A day is empty when it has no reports, no facts and no needs (open needs from earlier days count).

**Response:**

```json
{
  "day": "2026-11-23",
  "sources": [
    { "source": "board", "status": "not_configured", "count": 0, "at": "2026-11-23T17:00:00.000Z" },
    { "source": "github", "status": "ok", "count": 14, "at": "2026-11-23T17:00:00.000Z" },
    { "source": "slack", "status": "error", "count": 0, "message": "Slack API: ratelimited (HTTP 429)", "at": "2026-11-23T17:00:01.000Z" }
  ],
  "book": {
    "slug": "2026-11-23",
    "created": false,
    "empty": false,
    "incomplete": true,
    "published": true,
    "version": 3,
    "writer": "anthropic/claude-sonnet-5.5"
  },
  "ok": false
}
```

`book.writer` is the model id, or `compiler` when no model was used. `book.writerError` appears when the model failed.

| Status | Meaning |
| --- | --- |
| `200` | Published (or compiled, with `publish: false`), no built-in source failed. `ok: true`. |
| `207` | At least one built-in source returned `error`. The book is still published, marked incomplete. `ok: false`. |
| `422` | The day is empty. Nothing is published; `digest.failed` is sent. `ok: false`. |
| `400` | Invalid body. |
| `401` | Missing or wrong token. |

`207` reflects built-in collectors run during this call. A source that pushed `run.status: "error"` through `/api/ingest/facts` marks the book incomplete but does not change the status code.

```bash
curl -X POST "$FOLIO_URL/api/automation/run" \
  -H "Authorization: Bearer $FOLIO_INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '{ "day": "2026-11-22", "useModel": false }'
```

### `GET /api/automation/status`

| Query | Default |
| --- | --- |
| `day` | today |

**Response `200`:**

```json
{
  "day": "2026-11-23",
  "book": { "slug": "2026-11-23", "status": "published", "version": 3, "incomplete": true, "updatedAt": "…", "publishedAt": "…" },
  "sources": [
    { "source": "github", "status": "ok", "count": 14, "message": null, "at": "…" },
    { "source": "linear", "status": "ok", "count": 2, "message": null, "at": "…" }
  ]
}
```

`book` is `null` when the day has never been compiled. `sources` lists the latest run of each source for the day, pushed sources included.

```bash
curl "$FOLIO_URL/api/automation/status?day=2026-11-23" -H "Authorization: Bearer $FOLIO_INGEST_TOKEN"
```

### `GET /api/cron/digest`

The endpoint for a platform cron (the daily cron in `vercel.json`). It publishes today's book if it is due and not yet published.

- Off Vercel, or on Vercel with `FOLIO_CRON_HOURLY=true`: does nothing before the configured publication time.
- On Vercel without `FOLIO_CRON_HOURLY`: ignores the time and runs on every call.
- In both cases: does nothing if today's book is already published.

**Response `200`:** `{ "ran": false }` or `{ "ran": true, "day": "2026-11-23", "published": true, "incomplete": false }`.

```bash
curl "$FOLIO_URL/api/cron/digest" -H "Authorization: Bearer $CRON_SECRET"
```

---

## Webhooks

Webhooks are added in Settings with a URL and the events it receives. Folio sends:

```
POST <your URL>
content-type: application/json
user-agent: Folio-Webhook/1.0
x-folio-event: book.published
x-folio-signature: sha256=<hex>      (only when FOLIO_WEBHOOK_SECRET is set)
```

Body:

```json
{ "event": "book.published", "at": "2026-11-23T17:00:03.000Z", "instance": "https://folio.example.com", "data": { } }
```

`instance` is `FOLIO_PUBLIC_URL` (or the Vercel production URL), else `null`.

| Event | `data` |
| --- | --- |
| `book.published` | `{ "slug", "version", "updated", "incomplete", "failedSources": string[], "url" }`. `updated` is `true` when the book existed already. `url` is the reader URL, or `null` without a public URL. |
| `needs_you.created` | `{ "id", "kind", "title", "detail", "deadline", "blocking", "url", "sourceUrl" }`. `url` points to `/needs#<id>` when a public URL is known. |
| `digest.failed` | `{ "day", "reason": "empty" \| "not_published", "sources": SourceRunSummary[] }` |

The "Send a test" button in Settings sends a `book.published` event with `data: { "test": true, "slug": "test", "message": "Folio webhook test" }`.

Delivery: one attempt, 10-second timeout, no retry. Each delivery is logged with its HTTP status; Settings shows the last 10, with the target URL masked.

**Verifying the signature** (Node):

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

function verify(rawBody, header, secret) {
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  return header?.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}
```

Compute the HMAC over the raw request body, before any JSON parsing.

---

## Other endpoints

These endpoints serve the reading interface. They have no authentication and are not a stable API: they may change between versions.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | `{ "ok": true, "version" }` once the database is reachable. Suitable for health checks. |
| `GET /api/instance` | Instance flags: `demo`, `ai`, `ingestProtected`, `persistent`, `vercel`, `version`. |
| `GET /api/library` | Books with reading progress, plus `today`, `digestTime`, `timezone`. |
| `GET /api/books/:slug` | A book (`slug` is `YYYY-MM-DD` for a day, `YYYY-MM` for a month). |
| `PATCH /api/books/:slug` | Manual edits: `{ title?, subtitle?, blocks?: { [blockId]: text } }`. |
| `POST /api/books/:slug/regenerate` | `{ discardEdits?: false, useModel?: true }`. Recompiles a day (without collecting) and publishes it. |
| `GET /api/books/:slug/export?format=epub\|pdf` | Download a published book. Default `epub`. |
| `PUT /api/books/:slug/state` | Reading position and time. |
| `PUT /api/books/:slug/favorite` | `{ favorite: boolean }`. |
| `POST /api/books/:slug/annotations`, `PATCH`/`DELETE /api/books/:slug/annotations/:id` | Bookmarks, highlights and notes. |
| `GET /api/search?q=` | Full-text search across day books (at least 2 characters, 50 hits max). |
| `GET /api/reports/:id` | One agent report. |
| `GET /api/needs?status=open\|resolved\|all`, `POST /api/needs/:id` | List needs; `{ action: "resolve" \| "reopen", resolution? }`. |
| `GET /api/work`, `POST /api/work/:id/release`, `POST /api/work/:id/undo` | Claims, release from the UI, undo a takeover or release. |
| `GET /api/activity?after=`, `GET /api/live` | Activity events; `/api/live` is a Server-Sent Events stream (`activity` and `ping` events, reconnect with `Last-Event-ID`). |
| `POST /api/chat`, `GET`/`DELETE /api/chats/:id` | "Ask the book" chat (AI SDK UI message stream). |
| `POST /api/digest` | "Compile now": collect, compile and publish a day (`{ day? }`). |
| `GET /api/settings`, `PUT /api/settings` | Settings, source status, webhook management, recent deliveries. |
| `POST /api/sources/:kind/test` | Check a built-in collector's credentials. |
| `POST /api/webhooks/test` | Send a test webhook. |
| `DELETE /api/demo` | Delete all data on the instance, demo included, and keep the demo from coming back. |
| `GET /api/demo-sources/:id` | A fictional demo record. |
| `GET /covers/:slug.svg` | A book's generated cover. |
