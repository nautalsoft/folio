# Contributing to Folio

Thanks for your interest. Bug reports, collectors, translations, reader improvements and documentation are all welcome. For anything larger than a fix, open a [Discussion](https://github.com/nautalsoft/folio/discussions) or an issue first so we can agree on the approach.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE), and you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Requirements: Node 22+, pnpm 10, and Docker if you want Postgres locally.

```bash
git clone https://github.com/nautalsoft/folio.git folio
cd folio
pnpm install
pnpm dev
```

The app runs on <http://localhost:3000> with an in-memory database and the fictional demo library. To keep data between restarts, set `FOLIO_DATA_DIR=.data/folio` (embedded PGlite) or `DATABASE_URL` (Postgres). Copy `.env.example` to `.env` for local settings; `.env` is git-ignored.

To work on a collector, set its variables in `.env` (see [docs/sources.md](docs/sources.md)) and use **Settings → Sources → Test**, then "Collect and publish now".

## Tests

```bash
pnpm typecheck   # vue-tsc
pnpm test        # unit tests (vitest)
pnpm test:e2e    # end-to-end tests (Playwright)
```

- Bug fixes come with a test that fails before the fix.
- Collectors are tested with mocked HTTP responses (see `tests/collectors.test.ts`); tests never call real services.
- Fixtures use fictional names, projects and URLs only.

## Conventions

### Interface

- Use `@ui-sdk/vue` components first. If none fits, compose `@ui-sdk/core` behaviors (`definePrimitive`, `createParts`, `createPopup`, `createRovingFocus`…). Read `node_modules/@ui-sdk/vue/docs/llms.txt` before you start.
- No other UI kit, and never hand-roll focus management, keyboard handling, popups, selection or ARIA.
- Style with Tailwind classes and the existing CSS in `app/assets/css`.
- Mark destructive actions with `data-agent-confirm="<what it does>"`, so browser agents ask before using them.

### AI

- Every model call goes through the AI SDK, using `languageModel()` from `server/utils/ai.ts`. `@ai-sdk/vue` is for AI flows only.
- Everything works without a model. Add a fallback for any new AI feature.
- Source and agent content goes to a model only through `isolate()`, with `untrustedDataRules` in the system prompt.

### i18n

- Every user-facing string is a key in both `i18n/locales/fr.json` and `i18n/locales/en.json`. Book text is in `shared/utils/book-strings.ts`, in both languages.
- New languages are welcome: add a locale file and register it in `nuxt.config.ts`.

### Code

- TypeScript strict. Match the existing style: no semicolons, single quotes, 2-space indent.
- Keep changes focused. Don't reformat or refactor code unrelated to your change.
- New collectors follow `server/collectors/github.ts`, implement the `Collector` interface, and are documented in `docs/sources.md`.
- New endpoints are validated with zod and documented in `docs/api.md`. Machine endpoints call `requireIngestToken`.
- Database changes: edit `server/db/schema.ts`, then generate a migration with `pnpm drizzle-kit generate` and commit it.
- Significant design decisions get an ADR in `docs/adr`.

### No secrets, no personal data

- Never commit tokens, `.env` files, private URLs or real people's data, including in tests, screenshots and issue reports.
- Use placeholders such as `https://folio.example.com` and `YOUR_TOKEN`.
- No telemetry or analytics, ever.

## Commits and pull requests

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Add a scope when it helps: `feat(collectors): add Linear`.
- One topic per pull request. Fill in the template: what changed, why, how you tested it, and screenshots for interface changes (demo data only).
- `pnpm typecheck` and `pnpm test` must pass. CI runs them on every pull request.
- Add an entry under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

## Where to start

Issues labelled `good first issue` are scoped and come with the files to touch. The [roadmap](ROADMAP.md) lists bigger items.
