# Folio for Claude Code

Two ways to teach Claude Code to report to Folio: install the skill (recommended), or paste a short snippet into `CLAUDE.md`. Both read the instance URL and token from the environment; never write them into a file that gets committed.

## 1. Give Claude Code the URL and token

Export them in the shell that starts Claude Code:

```bash
export FOLIO_URL=https://folio.example.com
export FOLIO_INGEST_TOKEN=YOUR_TOKEN
```

or put them in your personal settings, `~/.claude/settings.json`, which is not part of any repository:

```json
{
  "env": {
    "FOLIO_URL": "https://folio.example.com",
    "FOLIO_INGEST_TOKEN": "YOUR_TOKEN"
  }
}
```

## 2a. Install the skill

Copy the `folio-report` folder from this repository into a skills directory:

```bash
# for every project on this machine
mkdir -p ~/.claude/skills && cp -r skills/folio-report ~/.claude/skills/

# or for one project only (commit it with the project)
mkdir -p .claude/skills && cp -r /path/to/folio/skills/folio-report .claude/skills/
```

Claude Code loads the skill when a task matches its description: before starting a task, when it needs a decision, and when it finishes. You can also ask for it directly ("report this to Folio").

## 2b. Or paste this into CLAUDE.md

```markdown
## Folio reports

If `FOLIO_URL` is set, report work to Folio (send `Authorization: Bearer $FOLIO_INGEST_TOKEN` when that variable is set). Agent: `{"id": "claude-<project>", "name": "Claude", "kind": "claude-code"}`. A Folio error never blocks the task.

- Before starting a task: `GET $FOLIO_URL/api/ingest/work?key=<task-key>`. If `free` is false and `item.claimedBy` is another agent, don't start; tell me who holds it.
- Then `POST $FOLIO_URL/api/ingest/work` with `{"agent": ..., "action": "claim", "task": {"key": "<task-key>", "title": "..."}}`. If the response has `resumeFrom`, continue from its `resumeHint`.
- On long tasks, after each meaningful step: `"action": "checkpoint"` with `"checkpoint": {"note": "...", "step": "2/4", "resumeHint": "..."}`.
- When you need my decision, review or an unblock: `POST $FOLIO_URL/api/ingest/needs` with `{"agent": ..., "needs": [{"key": "...", "kind": "decision|blocker|review", "title": "...", "detail": "...", "url": "..."}]}`.
- When done: `POST $FOLIO_URL/api/ingest/report` with `{"agent": ..., "key": "<task-key>", "project": "...", "title": "...", "summary": "...", "items": [{"text": "...", "status": "done|blocked|waiting|info", "url": "..."}]}`, then `"action": "done"` on `/api/ingest/work` (or `"release"` if you stop unfinished).
- Never include secrets, tokens, `.env` contents or personal data in anything sent to Folio.
```

The full procedure, with every field, is in [`folio-report/SKILL.md`](folio-report/SKILL.md). The API reference is in [`docs/api.md`](../docs/api.md).
