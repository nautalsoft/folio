# ADR 0003: Book format and citations

Status: accepted (2026-11-23)

## Context

A daily report written freely by a language model is pleasant to read and impossible to trust: it can merge, embellish or invent. Readers need to check any statement in one click. Books are also edited by hand, regenerated when late data arrives, exported to EPUB and PDF, and searched.

## Decision

- A book is structured data, `BookContent` (`shared/types/folio.ts`): chapters made of typed blocks (`heading`, `paragraph`, `fact`, `code`, `diff`, `trace`, `quote`, `notice`) and a map of citations.
- The book is **compiled deterministically** from stored inputs (`server/folio/build.ts`): preface, "Needs you", one chapter per agent, one per source, and a "Sources" chapter with the status of each source.
- **Every fact cites a source**: a citation with a label and a clickable URL (pull request, deployment, message, ticket, or the agent report's page in Folio).
- The model, when there is one, only **adds prose paragraphs** on top of the compiled facts (`server/folio/writer.ts`). It receives the facts with their citation ids and may only cite ids it was given; any other id is dropped. Facts themselves are never rewritten by the model.
- **Block ids are deterministic** hashes of the chapter and the input record (or chapter and paragraph position for prose). Manual edits are stored as **overrides** keyed by block id, and applied again after every regeneration, unless the reader chooses to discard them.

## Consequences

- A book can be trusted at the level of facts even when the prose is wrong, and every claim can be checked.
- Without any model, Folio still produces a complete book.
- Regenerating a day (late reports, a source that failed) keeps the reader's corrections.
- Exports, search and the chat all read the same blocks; no HTML parsing.
- An override whose block disappears after regeneration (its input was removed) is silently ignored.
- The prose is limited to short paragraphs; Folio is not meant to produce long narrative text.
