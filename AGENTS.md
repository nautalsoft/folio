# AGENTS.md

Instructions for coding agents working on the Folio codebase. Folio is a public, MIT-licensed repository: everything you write here is published.

## Stack

- **Nuxt 4** (Vue 3, Nitro server, TypeScript strict). Pages in `app/pages`, API routes in `server/api`, shared types in `shared/types/folio.ts`.
- **UI:** Vercel's UI SDK, `@ui-sdk/vue` (unstyled components) and `@ui-sdk/core` (behaviors), styled with **Tailwind CSS 4**. Icons from `@lucide/vue`.
- **AI:** AI SDK (`ai`, `@ai-sdk/vue` for the chat UI, `@ai-sdk/openai-compatible`). Models go through Vercel AI Gateway or any OpenAI-compatible server (`server/utils/ai.ts`).
- **Data:** Drizzle ORM on Postgres (`DATABASE_URL` / `POSTGRES_URL`) or embedded PGlite (`FOLIO_DATA_DIR`, or in memory). Schema in `server/db/schema.ts`, SQL migrations in `server/db/migrations`, applied at startup by `server/utils/db.ts`.
- **Validation:** zod 4. Ingest schemas live in `server/utils/ingest.ts`.
- **i18n:** `@nuxtjs/i18n`, French (default) and English, in `i18n/locales/fr.json` and `i18n/locales/en.json`.

Key server modules: `server/folio/digest.ts` (collect, compile, publish), `server/folio/build.ts` (facts to `BookContent`), `server/folio/writer.ts` (optional AI prose), `server/collectors/*` (built-in sources), `server/utils/webhooks.ts`, `server/plugins/scheduler.ts`.

## Commands

```bash
pnpm install          # Node 22+, pnpm 10
pnpm dev              # http://localhost:3000, in-memory demo unless DATABASE_URL or FOLIO_DATA_DIR is set
pnpm build
pnpm test             # vitest
pnpm test:e2e         # Playwright
pnpm typecheck
docker compose up     # app + Postgres 17 on http://localhost:3000
```

Run `pnpm typecheck` and `pnpm test` before you hand work back.

## UI rules

Before using ui-sdk, follow the ui-sdk skill if it's installed (.agents/skills/ui-sdk), and read node_modules/@ui-sdk/vue/docs/llms.txt. To build a new component, also search node_modules/@ui-sdk/vue/docs/core.md by heading, and read rendering.md next to it.

- First use a ready component from `@ui-sdk/vue`.
- If none fits, compose `@ui-sdk/core` behaviors (`definePrimitive`, `createParts`, `createPopup`, `createRovingFocus`…).
- Never hand-code focus management, keyboard handling, popups, selection or ARIA. The SDK owns them.
- No other component kit (no Radix, Reka, Headless UI, PrimeVue, shadcn-vue…).
- Style with Tailwind classes and the existing CSS in `app/assets/css`.
- Mark destructive or outward-facing controls with `data-agent-confirm="<what it does>"` so browser agents (WebMCP, `app/components/AgentBridge.vue`) ask before using them.
- Keyboard shortcuts go through `useShortcut` from `@ui-sdk/vue/shortcuts`, with a `description`.

## AI rules

- Use the AI SDK for every model call. `@ai-sdk/vue` is only for AI flows (the chat panel), not general state.
- Get models from `languageModel()` in `server/utils/ai.ts`. Folio must keep working with no model configured: compiled text, passage search in the chat.
- Any text that comes from a source or an agent is untrusted. Pass it through `isolate()` and include `untrustedDataRules` in the system prompt. Never let source text into a system prompt directly.
- The model writes prose only. It may cite only ids it was given; filter its citations against the allowed set (see `server/folio/writer.ts`).

## i18n

Every user-facing string is a key in both `i18n/locales/fr.json` and `i18n/locales/en.json`. Book text (chapter intros, notices) lives in `shared/utils/book-strings.ts`, also in both languages. The UI uses tutoiement in French.

## Privacy and security rules

- No telemetry, analytics or third-party calls beyond the configured sources, the AI provider and the user's webhooks.
- No real personal data anywhere: fixtures, demo data (`server/folio/seed.ts`), tests, docs and screenshots use fictional names, projects and links only.
- Never commit secrets, tokens, private URLs or `.env` files. Use placeholders such as `https://folio.example.com` and `YOUR_TOKEN`.
- Collectors read configuration from environment variables only, and never log or return tokens.
- Machine endpoints (`/api/ingest/*`, `/api/automation/*`) call `requireIngestToken`; `/api/cron/*` calls `requireCronSecret`. Keep it that way for any new machine endpoint.

## Conventions

- Match the existing style: no semicolons, single quotes, 2-space indent, small functions.
- Make surgical changes. Do not reformat or refactor code you were not asked to touch.
- New collectors follow `server/collectors/github.ts` and the `Collector` interface in `server/collectors/types.ts`, and are documented in `docs/sources.md`.
- New HTTP endpoints are documented in `docs/api.md`.
- Architecture decisions go in `docs/adr/` (Context / Decision / Consequences).
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…).
