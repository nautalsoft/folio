# ADR 0004: No accounts, a single reader per instance

Status: accepted (2026-11-23)

## Context

Folio is a personal tool: one person reads what their agents did. User accounts would bring sign-up, password storage, sessions, password reset and permission checks on every endpoint, which is a large and risky surface for a project that has one user per instance. Agents and schedulers, on the other hand, call the instance from outside and need a simple credential.

## Decision

- **No login and no user model.** Reading state, favorites, highlights, notes and chats belong to the instance.
- **Machine endpoints are token-protected:** `/api/ingest/*` and `/api/automation/*` require `Authorization: Bearer $FOLIO_INGEST_TOKEN` when it is set; `/api/cron/*` requires `CRON_SECRET` (or the ingest token). Tokens are compared in constant time and never displayed in the interface.
- **The interface is protected outside the app**, when the instance is public: by a reverse proxy with authentication, a VPN, or the hosting platform's access protection. The docs explain how to leave the machine paths reachable.
- Interface preferences (themes, fonts, WebMCP mode) are kept in the browser's local storage.

## Consequences

- No credentials to store or leak, and nothing to configure for a local instance.
- A public instance without proxy protection is open to anyone who finds it: they can read books, change settings, add webhooks and delete all data. The README and the self-hosting guide warn about this.
- Several people sharing one instance share one reading progress.
- Per-reader progress would need a notion of reader; it is on the roadmap, without accounts if possible.
