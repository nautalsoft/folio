# Roadmap

What we would like to do next. Nothing here has a date. If you want to work on an item, say so in [Discussions](https://github.com/nautalsoft/folio/discussions) first.

## Next

- **More native collectors**: Linear and Jira first, then GitLab and Discord. (Until then, these tools can already push facts with `POST /api/ingest/facts`.)
- **Per-agent feeds**: RSS/Atom feeds of books and of each agent's chapters, for feed readers.
- **OPDS catalog**, so e-reader apps can browse and download the library.
- **Offline reading** as an installable PWA, with books cached for reading without a connection.
- **Keyboard shortcut help** listing the reader's shortcuts.
- **More languages** for the interface and the books.

## Later

- **Reading progress for several readers** on one instance, without introducing accounts if possible (see [ADR 0004](docs/adr/0004-no-accounts-single-reader.md)).
- **Webhook retries** and a restriction to public target addresses.

## Not planned

- A hosted Folio service.
- Telemetry or analytics of any kind.
- User accounts and permission management inside the app.
