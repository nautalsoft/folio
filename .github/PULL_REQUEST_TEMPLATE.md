## What and why

<!-- What does this change, and why? Link the issue or discussion: "Closes #123". -->

## How I tested it

<!-- Commands you ran, cases you checked. -->

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e` (if the interface changed)

## Screenshots

<!-- For interface changes, with demo data only. -->

## Checklist

- [ ] The title follows Conventional Commits (`feat:`, `fix:`, `docs:`…).
- [ ] UI uses `@ui-sdk/vue` components or `@ui-sdk/core` behaviors only; no hand-written focus, keyboard, popup or ARIA logic.
- [ ] New strings exist in both `i18n/locales/fr.json` and `i18n/locales/en.json`.
- [ ] Destructive actions carry `data-agent-confirm`.
- [ ] New endpoints, variables or collectors are documented (`docs/api.md`, `.env.example`, `docs/sources.md`).
- [ ] No secrets, private URLs or real personal data, including in tests and screenshots.
- [ ] `CHANGELOG.md` has an entry under "Unreleased" for user-visible changes.
