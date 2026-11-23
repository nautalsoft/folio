# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **private vulnerability reporting**: go to the repository's [Security tab](https://github.com/nautalsoft/folio/security) and choose **Report a vulnerability**. Do not open a public issue or discussion for a security problem.

Include what you found, how to reproduce it, which version or commit you tested, and the impact you expect. Use fictional data in your report.

We aim to acknowledge reports within a week, and to agree on a disclosure date with you once a fix is ready. Folio is maintained by volunteers; there is no bug bounty.

## Supported versions

Only the latest release receives security fixes.

## Security model

Folio is a self-hosted, single-reader application (see [ADR 0004](docs/adr/0004-no-accounts-single-reader.md)):

- The **reading interface has no authentication**. Protecting a public instance (reverse proxy with authentication, VPN, platform access protection) is the operator's responsibility. Reports that an unprotected interface can be used to change settings or delete data are expected behavior, not vulnerabilities.
- **Machine endpoints** (`/api/ingest/*`, `/api/automation/*`, `/api/cron/*`) are protected by bearer tokens when `FOLIO_INGEST_TOKEN` / `CRON_SECRET` are set.

## In scope

- **Ingest token.** Any way to call `/api/ingest/*` or `/api/automation/*` without the token when `FOLIO_INGEST_TOKEN` is set, or `/api/cron/*` without `CRON_SECRET`; any way to read the token from the interface, logs, exports or API responses.
- **Prompt injection from sources.** Content collected from sources or pushed by agents reaches a model only inside `<source_data>` tags, with instructions to treat it as data. Reports of content that escapes this isolation, makes the model cite ids it wasn't given, or causes any action beyond writing prose are in scope.
- **Webhooks and SSRF.** Webhook URLs are added from the interface and Folio sends `POST` requests to them from the server. Folio does not currently restrict targets to public addresses: a webhook can point to `localhost` or a private network. This matters when the interface is exposed without protection. Ways to reach internal services without access to the interface, or to read responses from webhook targets, are in scope. Operators should protect the interface and, if needed, restrict the server's outgoing traffic.
- **Secrets from collectors.** Any path where a collector token (`GITHUB_TOKEN`, `SLACK_BOT_TOKEN`…) appears in a response, a book, an export, an activity event or a log.
- **Stored content.** Script injection through report, fact or source content rendered in the reader, the chat or the exports.

## Out of scope

- Attacks that require access to an unprotected interface (see above), or to the server's environment variables.
- Denial of service by sending large volumes of valid data with a valid token.
- Vulnerabilities in dependencies without a demonstrated impact on Folio; report those upstream.
