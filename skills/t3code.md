# Folio for t3code

t3code runs coding agents (Codex, Claude Code) on your projects. Those agents read their usual instruction files, so the setup is the one for the agent you use, plus one detail: the environment variables must be visible to the processes t3code starts.

## 1. Make the URL and token available

Set them in the environment t3code is launched from (your shell profile, or the service that starts it), never in a committed file:

```bash
export FOLIO_URL=https://folio.example.com
export FOLIO_INGEST_TOKEN=YOUR_TOKEN
```

Restart t3code after changing them, so new sessions inherit them.

## 2. Add the instructions

- For Claude Code sessions: install the skill or paste the `CLAUDE.md` snippet from [claude-code.md](claude-code.md).
- For Codex sessions: paste the `AGENTS.md` snippet from [codex.md](codex.md).

In either snippet, use `"kind": "t3code"` and a distinct agent id (for example `t3-<project>`), so the book shows these sessions as their own agent:

```json
{ "id": "t3-herbier", "name": "t3 · Herbier", "kind": "t3code" }
```

## 3. One agent per thread, or one per project

The agent id decides how work is grouped into chapters. Use one id per project (`t3-herbier`) to get one chapter per project, or one id per long-lived thread if you run several threads on the same project in parallel and want to tell them apart.

Use the claim step (`GET /api/ingest/work?key=...`, then `"action": "claim"`) when several threads may pick from the same task list: it prevents two threads from starting the same task, and checkpoints let one thread resume another's work.

The full procedure is in [`folio-report/SKILL.md`](folio-report/SKILL.md).
