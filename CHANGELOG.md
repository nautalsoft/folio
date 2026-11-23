# Changelog

All notable changes to Folio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-11-23

### Added
- A "Pull requests" chapter in every book: open PRs, merged or closed ones, failing CI first, each linked to GitHub. The Board collector reads PR mirror threads (`pr=owner/repo#n` with `state`, `ci`, `review` labels).
- A rewritten writing brief: lede first, one story per paragraph, every friction item in the prose, every claim cited.
- `FOLIO_REASONING` sets the reasoning effort of the writing model and the chat (AI SDK portable `reasoning`, default `minimal`).
- `FOLIO_BOARD_NEEDS_LABEL` chooses which Board label marks a "needs you" item.

### Security
- Credentials found in source or agent text (web push subscriptions, GitHub/Slack/OpenAI/Anthropic tokens, private keys, JWTs, bearer tokens…) are masked before they are stored, so they never reach a book, an export or a prompt.

## [Unreleased]

## [1.0.0] — 2026-11-23

First public release.

### Added

- Daily books compiled from agent reports and source facts: preface, "Needs you", one chapter per agent, one per source, and a "Sources" chapter with the status of each source. Books with a failed source are marked incomplete.
- Monthly collections gathering the published days of a month.
- Citations on every fact, linking to the original pull request, deployment, message, ticket or agent report.
- Built-in collectors for Vercel Board, GitHub, Vercel deployments, Slack, ClickUp and Notion, configured through environment variables and testable from Settings.
- Ingest API: agent reports (`POST /api/ingest/report`), facts from any tool under its own source name (`POST /api/ingest/facts`), needs (`POST /api/ingest/needs`), task claims, heartbeats and checkpoints (`GET`/`POST /api/ingest/work`), and activity events (`POST /api/ingest/activity`), protected by `FOLIO_INGEST_TOKEN`.
- Automation API: idempotent daily run (`POST /api/automation/run`, 200/207/422) and run status (`GET /api/automation/status`).
- Scheduling: in-process scheduler for self-hosted instances, cron endpoint for Vercel (`/api/cron/digest`, `CRON_SECRET`, `FOLIO_CRON_HOURLY`).
- Optional AI prose through Vercel AI Gateway (API key or OIDC on Vercel) or any OpenAI-compatible server, with source content isolated in `<source_data>` tags. Books compile without a model.
- Reader: paged or scrolling layout, four themes, fonts, size, spacing, margins, justification, bold text, reading guide, table of contents, search in book, bookmarks, highlights in four colors, notes, reading progress and time.
- Library with generated covers, search across books, collections, favorites and progress.
- "Ask the book" chat with cited passages, built with the AI SDK, with a passage-search fallback when no model is configured.
- Manual edits of books, preserved when a book is regenerated.
- "Needs you" page for decisions, blockers and reviews, sorted by deadline.
- "Who's on it" page for task claims, stale claims, checkpoints, release and undo.
- Live activity feed over Server-Sent Events.
- EPUB and PDF export.
- Webhooks for `book.published`, `needs_you.created` and `digest.failed`, with optional HMAC signatures (`x-folio-signature`).
- Browser agents (WebMCP) through the UI SDK's agent bridge, with "always ask", "ask for sensitive actions" and "off" modes.
- French and English interface and books; light and dark color schemes.
- Storage on Postgres (`DATABASE_URL` / `POSTGRES_URL`) or embedded PGlite (`FOLIO_DATA_DIR`, or in memory), with automatic migrations.
- Fictional demo library seeded on empty instances (`FOLIO_DEMO=false` to disable).
- Docker Compose setup with Postgres 17, and one-click Vercel deployment.
- Ready-to-paste agent instructions in `skills/` for t3code, Claude Code, Codex, Grok Bot and cloud agents.

[Unreleased]: https://github.com/nautalsoft/folio/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nautalsoft/folio/releases/tag/v1.0.0
