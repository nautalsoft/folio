# Folio for Grok Bot

These instructions are for a bot built on Grok that can either call HTTP APIs (through a tool or function) or run shell commands. Paste the block below into the bot's system prompt or custom instructions, and give the bot's runtime the two environment variables. If the bot can do neither, have the program that hosts it push the report after each conversation or task, with [`examples/push-report.sh`](examples/push-report.sh) or [`examples/push-report.mjs`](examples/push-report.mjs).

## 1. Configure the runtime

```bash
FOLIO_URL=https://folio.example.com
FOLIO_INGEST_TOKEN=YOUR_TOKEN
```

Keep the token in the runtime's secret store. Never paste it into the prompt: prompts can be echoed back.

## 2. Instructions for the bot

```text
You report your work to Folio, a daily book that a person reads every evening.
Your agent reference is {"id": "grok-bot", "name": "Grok Bot", "kind": "grok"}.
All requests go to $FOLIO_URL with Content-Type: application/json, and Authorization: Bearer $FOLIO_INGEST_TOKEN when it is set.
If a Folio request fails, say so in your answer and carry on; never let it block the task.

- When you finish a task, POST /api/ingest/report:
  {"agent": <your agent reference>, "key": "<stable task key>", "title": "<what the task was>",
   "summary": "<what you did, 2-3 plain sentences>",
   "items": [{"text": "<outcome>", "status": "done|blocked|waiting|info", "url": "<link to the result, if any>"}]}
  Sending the same key again updates the report.
- When a person must decide, review or unblock something, POST /api/ingest/needs:
  {"agent": <your agent reference>, "needs": [{"key": "<stable key>", "kind": "decision|blocker|review",
   "title": "<a question they can answer>", "detail": "<options and trade-offs>", "url": "<where to act>"}]}
- For something worth seeing live that doesn't belong in the book, POST /api/ingest/activity:
  {"agent": <your agent reference>, "title": "<one line>"}

Never include secrets, tokens, passwords or personal data in anything you send to Folio.
Only report what you actually did and verified.
```

## 3. Tool definition (optional)

If your bot uses function calling, expose one tool that posts a report, and let your code add the URL and token:

```json
{
  "name": "folio_report",
  "description": "Report a finished task to Folio, the daily book of agent work.",
  "parameters": {
    "type": "object",
    "properties": {
      "key": { "type": "string", "description": "Stable task key; the same key updates the same report" },
      "title": { "type": "string", "maxLength": 300 },
      "summary": { "type": "string", "maxLength": 8000 },
      "status": { "type": "string", "enum": ["done", "blocked", "waiting", "info"] },
      "url": { "type": "string", "description": "Link to the result, if any" }
    },
    "required": ["title", "summary", "status"]
  }
}
```

Your code then sends `{ "agent": {"id": "grok-bot", "name": "Grok Bot", "kind": "grok"}, "key", "title", "summary", "status", "items": url ? [{ "text": title, "status", "url" }] : [] }` to `POST $FOLIO_URL/api/ingest/report`.

The API reference is in [`docs/api.md`](../docs/api.md).
