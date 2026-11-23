# ADR 0006: Open sources and prompt isolation

Status: accepted (2026-11-23)

## Context

Agents and teams use many tools: issue trackers, chats, CI, home-made scripts. Folio can't ship a collector for each one. At the same time, everything Folio reads (chat messages, ticket descriptions, pull request bodies, agent reports) is written by people or programs Folio doesn't control, and some of it reaches a language model. Text such as "ignore your instructions and…" in a ticket must not steer the model.

## Decision

- **Sources are open-ended.** Besides the six built-in collectors (Vercel Board, GitHub, Vercel deployments, Slack, ClickUp, Notion), any tool can push facts with `POST /api/ingest/facts` under its own source name (`linear`, `jira`, `discord`…). Names are normalized to a slug. A pushed source gets its own chapter and appears in the book's source status, and can report its own failure (`run.status: "error"`), which marks the book incomplete.
- Built-in collectors read their configuration from environment variables only, and are skipped (`not_configured`) when it is missing.
- **All collected and pushed text is untrusted data.** Before it reaches a model, it is serialized as JSON inside `<source_data>` tags (`isolate()` in `server/utils/ai.ts`), with any `<source_data>` tag inside it removed. The system prompt says that this content is data to describe, never instructions, whatever it claims.
- The model only writes prose paragraphs and may only cite ids it was given (ADR 0003). It has no tools and cannot trigger actions.
- Folio never acts on source content: no link is followed, nothing is executed.

## Consequences

- New tools integrate without a code change, and the community can add native collectors over time.
- A prompt injection can at worst make a paragraph inaccurate; the cited facts next to it stay correct and checkable.
- Isolation is a mitigation, not a guarantee: models can still be influenced. Prompt injection from sources stays in the scope of the security policy.
- A pushed source name that matches a built-in one (`github`) mixes with that collector's facts. Pick a distinct name.
