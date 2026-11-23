# ADR 0001: Nuxt 4 and Vercel's UI SDK

Status: accepted (2026-11-23)

## Context

Folio is a reading application with a small server: ingest endpoints, a daily compile job, exports, and a chat. It must run the same way on a laptop, in a Docker container and on Vercel. The interface is mostly reading: a library, a reader with pagination, popovers, menus, dialogs and selection tools. These widgets are where accessibility usually breaks: focus traps, keyboard navigation, ARIA roles, dismissal.

We also want the interface to be usable by agents running in the browser, not only by people.

## Decision

- **Nuxt 4** for both the interface and the server. One codebase, one build; Nitro runs as a Node server (Docker) or as functions (Vercel) without changes. Server routes live in `server/api`, shared types in `shared/`.
- **Vercel's UI SDK** for every interactive component: `@ui-sdk/vue` components first, and `@ui-sdk/core` behaviors (`definePrimitive`, `createParts`, `createPopup`, `createRovingFocus`…) when a component doesn't exist. The components are unstyled; styling is **Tailwind CSS 4**.
- No other component kit, and no hand-written focus, keyboard, popup, selection or ARIA logic.
- The SDK's agent bridge (`createAgent`, `registerTools`) exposes the components to browser agents over WebMCP. A Settings switch chooses "always ask", "ask for sensitive actions" or "off". Destructive controls carry `data-agent-confirm`.
- **AI SDK** for model calls and `@ai-sdk/vue` for the chat UI.

## Consequences

- Accessibility and keyboard behavior come from one library; bugs there are fixed once, upstream.
- The visual design is entirely ours, in Tailwind classes and `app/assets/css`.
- Contributors must learn the SDK's conventions. `AGENTS.md` and `CONTRIBUTING.md` point to its docs in `node_modules/@ui-sdk/vue/docs`.
- The SDK is pre-1.0 (`0.1.0-beta`); its versions are pinned exactly, and upgrades are deliberate.
- Agent access to the interface is a feature with a cost: every new destructive action needs a `data-agent-confirm` mark.
