# Folio for Codex

Codex reads instructions from `AGENTS.md` files: one in the repository, and optionally a personal one in your Codex home directory that applies to every project. Add the snippet below to either.

## 1. Give Codex the URL and token

Export them in the environment Codex runs in. Don't write them into `AGENTS.md` or any committed file.

```bash
export FOLIO_URL=https://folio.example.com
export FOLIO_INGEST_TOKEN=YOUR_TOKEN
```

Codex must be allowed to make network requests to your Folio host. If it runs in a sandbox without network access, the calls fail; the snippet tells it not to let that block the task.

## 2. Paste this into AGENTS.md

```markdown
## Folio reports

If `FOLIO_URL` is set, report work to Folio with curl (add `-H "Authorization: Bearer $FOLIO_INGEST_TOKEN"` when that variable is set). Agent: `{"id": "codex-<project>", "name": "Codex", "kind": "codex"}`. If a Folio call fails, mention it in your final message and continue; never let it block the task.

1. Before starting a task, check who holds it: `curl -sS "$FOLIO_URL/api/ingest/work?key=<task-key>"`. If `free` is false and `item.claimedBy` is another agent, stop and tell the user who holds it.
2. Claim it: `POST $FOLIO_URL/api/ingest/work` with `{"agent": ..., "action": "claim", "task": {"key": "<task-key>", "title": "..."}}`. If the response has `resumeFrom`, continue from its `resumeHint`.
3. After each meaningful step of a long task: `"action": "checkpoint"` with `"checkpoint": {"note": "...", "step": "2/4", "resumeHint": "how to pick up from here"}`.
4. If you need a human decision, an access or a review: `POST $FOLIO_URL/api/ingest/needs` with `{"agent": ..., "needs": [{"key": "...", "kind": "decision|blocker|review", "title": "a question the user can answer", "detail": "options and trade-offs", "url": "..."}]}`.
5. At the end: `POST $FOLIO_URL/api/ingest/report` with `{"agent": ..., "key": "<task-key>", "project": "...", "title": "...", "summary": "2-3 plain sentences", "items": [{"text": "...", "status": "done|blocked|waiting|info", "url": "PR, commit or deployment URL"}]}`. Then `"action": "done"` on `/api/ingest/work`, or `"release"` if you stop unfinished.

Send JSON bodies with `-H "Content-Type: application/json" -d @- <<'JSON' ... JSON`. Never include secrets, tokens, `.env` contents or personal data in anything sent to Folio. Don't report what you did not verify.
```

The full procedure is in [`folio-report/SKILL.md`](folio-report/SKILL.md); the API reference in [`docs/api.md`](../docs/api.md).
