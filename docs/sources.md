# Sources

Folio reads each source once per day being compiled. Every collector:

- reads its configuration **only from environment variables**, and never logs or returns a token;
- is skipped (`not_configured`) when its required variables are missing, so it never returns placeholder data;
- throws when the API fails. The run records the HTTP status and the API's own error text, and the book is marked incomplete;
- passes the run's abort signal to every request. A `429` is retried once, after `Retry-After` (or `X-RateLimit-Reset`), waiting 30 s at most;
- stores the text it collects as untrusted data. Folio trims it and never acts on it.

The day is the local day in the configured timezone, `[start, end)` in UTC. Each record becomes one of three things:

- **fact**: something that happened, upserted per day by `externalId`. Its `status` is `done`, `blocked`, `waiting` or `info`.
- **need**: something a human has to do, upserted by `externalId`.
- **work item**: who currently holds which task.

`actor` is matched to Folio agents with `FOLIO_AGENT_ALIASES` (`source:actor=agent`, comma-separated) or by an agent id that is identical.

---

## Vercel Board

Uses the official [`@vercel/board`](https://github.com/vercel/board#readme) SDK, because Board has no documented REST API. Its reference ships in `node_modules/@vercel/board/docs`: see `01-board/03-identity.md`, `01-board/05-reading.md`, `01-board/11-tasks.md` and `04-reference/02-board.md`.

| Variable | Required | Meaning |
| --- | --- | --- |
| `BOARD_TOKEN` | one of the first four | OIDC JWT for the board. Not needed in a Vercel deployment, where the SDK uses the deployment's OIDC token. |
| `BOARD_NAME` | one of the first four | Which of the team's boards to read. Empty means the team's default board. |
| `BOARD_URL` | one of the first four | A self-hosted board (`vb serve`, a board mounted in an app), used instead of the team's board in Vercel's API. |
| `FOLIO_BOARD_TEAM` | one of the first four | Team ID or slug that owns the board. Otherwise the SDK uses the deployment's team or `VERCEL_ORG_ID`. |
| `FOLIO_BOARD_NEEDS_LABEL` | no | Label key that marks a thread root as needing a person. Default `needs`. |
| `FOLIO_BOARD_CHANNELS` | no | Comma-separated channels to read. Empty means every channel the caller can read, listed with `channels()`. |

**When it counts as configured:** at least one of `BOARD_TOKEN`, `BOARD_URL`, `BOARD_NAME` or `FOLIO_BOARD_TEAM` is set. On Vercel, set `BOARD_NAME` (or `FOLIO_BOARD_TEAM`) to opt in and the deployment's own OIDC token is used. Folio opens the board with `ensure: false`, so it never creates a board that doesn't exist. A missing board fails with `no_board`. Do not set `BOARD_URL` on a Vercel deployment that reads its own team's board: the SDK never sends the deployment's OIDC token to a board addressed by URL, so the board answers 403 (`no_board`). Use `FOLIO_BOARD_TEAM` and `BOARD_NAME` there, and keep `BOARD_URL` with `BOARD_TOKEN` for other setups.

**Permissions:** the caller needs `read` on the channels it collects. A deployment of the board's own project and the project's people can read everything. Other callers need a grant: see the SDK's `01-board/09-access.md`. In practice, another project of the same team got a 403 (`no_board`) until it had its own grant, for example `vercel board grants create --project <your-folio-project> --environment production --can 'team/=read'` (one `--can` per channel prefix Folio should read).

**What it collects:**

- **Messages.** For each channel, Folio pages back with `threads({ channel, limit: 100, before })` until a page's oldest thread was last active before the day. Each thread active during the day is read with `thread(id)`, and every message created in `[start, end)` becomes a fact:
  - `kind` is `thread`, `reply` or `task`;
  - `actor` is the message's profile (`claude` in `claude via sam`), else the author's handle, else the actor ID;
  - `project` is the channel.

  A task root's fact takes the task's state: `completed` → done, `blocked`/`failed` → blocked, `waiting` → waiting. Everything else is `info`.
- **Links.** Neither the SDK nor its docs give a per-message web link for Vercel's board, so every board fact links to `BOARD_URL`, or else to the URL the board's `discovery()` returns.
- **Work items.** Folio reads `tasks.list({ state: 'open' })` (paged) and `tasks.list({ state: 'all', latest: true, limit: 50 })`, which catches tasks finished recently. Task state maps to work status: `claimed` → claimed, `completed` → done, `failed`/`canceled` → released, and anything else → open.
  - `claimedBy` is the claim holder's profile.
  - `heartbeatAt` is the thread's latest activity.
  - The latest reply becomes a checkpoint.
  - The SDK doesn't expose when a claim started, so `claimedAt` is null.
- **Needs.**
  - A task in state `blocked` (held for a person) becomes a `blocker`, with the block's kind and reason as its detail.
  - A thread root labelled `needs=<kind>` becomes a need of that kind (`decision`, `review` or `blocker`). Any other value, such as `needs=you`, becomes a `decision`. Set the label with `vb label <id> needs=review`. If your board already uses another key for this, set `FOLIO_BOARD_NEEDS_LABEL` to it (for example `FOLIO_BOARD_NEEDS_LABEL=waiting-on`).

**Limits:**

- Vercel's board has no search index and lists threads one channel at a time, so Folio reads channel by channel.
- `thread(id)` returns the SDK's default page of replies, so very long threads may be cut short.
- SDK reads take no abort signal. Folio checks the signal between calls.

---

## GitHub

Plain REST calls to `https://api.github.com` with `X-GitHub-Api-Version: 2022-11-28`.

| Variable | Required | Meaning |
| --- | --- | --- |
| `GITHUB_TOKEN` | yes | Personal access token (fine-grained recommended) |
| `GITHUB_REPOS` | yes | Comma-separated `owner/repo` |

**Token permissions (fine-grained):** Metadata (read), Contents (read, for commits), Issues (read), Pull requests (read), on the listed repositories. With a classic token, use `repo` for private repositories and no scope for public ones. Docs: [permissions for fine-grained tokens](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens) and [managing tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

**What it collects (per repository):**

- **Pull requests.** [`GET /repos/{o}/{r}/pulls?state=all&sort=updated&direction=desc`](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests), paged until the PRs were last updated before the day. Each PR updated during the day becomes a fact:
  - merged during the day → `done`;
  - open, not a draft, with requested reviewers or teams → `waiting`;
  - otherwise → `info`.

  A `waiting` PR also becomes a `review` need, listing who it's requested from.
- **Issues.** [`GET /repos/{o}/{r}/issues?state=all&since=<start>`](https://docs.github.com/en/rest/issues/issues#list-repository-issues). Pull requests are dropped (they carry a `pull_request` key). An issue closed during the day → `done`, otherwise `info`.
- **Commits.** [`GET /repos/{o}/{r}/commits?since=<start>&until=<end>`](https://docs.github.com/en/rest/commits/commits#list-commits), on the default branch. Each commit → `done`, titled with the first line of its message.

`actor` is the GitHub login (a commit falls back to its git author name). `project` is the repository name. The cheap check is `GET /repos/{first repo}`.

---

## Vercel deployments

| Variable | Required | Meaning |
| --- | --- | --- |
| `VERCEL_TOKEN` | yes | [Access token](https://vercel.com/docs/rest-api) with access to the team |
| `VERCEL_TEAM_ID` | no | `team_…`, sent as `teamId`. Leave it empty for a personal account. |
| `FOLIO_VERCEL_PROJECTS` | no | Comma-separated project IDs or names, sent as `projectId` one at a time. Empty means all projects. |

**What it collects:** [`GET /v7/deployments`](https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments) with `since`/`until` (ms timestamps), `limit=100`, and `teamId`. While `pagination.next` stays inside the day, Folio passes it back as `until` to read the next page. Every deployment created during the day becomes a fact.

| State | Status |
| --- | --- |
| `READY` | done |
| `ERROR` | blocked |
| anything else (`BUILDING`, `QUEUED`, `CANCELED`…) | info |

- `url` is `inspectorUrl`, or else `https://` + `url`.
- `actor` is `creator.username`, else `creator.githubLogin`, else `creator.uid`.
- `project` is the deployment's `name`.

The cheap check is the same endpoint with `limit=1`.

> The current docs list deployments at `/v7/deployments`, so Folio uses v7.

---

## Slack

| Variable | Required | Meaning |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | yes | Bot token, `xoxb-…` |
| `SLACK_CHANNEL_IDS` | yes | Comma-separated channel IDs (`C…`). Invite the bot to each one. |
| `FOLIO_SLACK_NEEDS_KEYWORD` | no | Marker that turns a message into a need. The default is `:raised_hand:`. Matching is a case-insensitive substring. Set it to a value like `needs-you` to use a word instead. |

**Scopes:** [`channels:history`](https://docs.slack.dev/reference/scopes/channels.history) for public channels and [`groups:history`](https://docs.slack.dev/reference/scopes/groups.history) for private ones. `auth.test` needs no scope.

**What it collects:** [`conversations.history`](https://docs.slack.dev/reference/methods/conversations.history) per channel, with `oldest`/`latest` (seconds) set to the day, `limit=200`, and cursor pagination.

- Every message becomes an `info` fact, except `channel_join`/`channel_leave`/`group_join`/`group_leave`.
- `actor` is `user`, else `username`, else `bot_id`.
- A message containing the needs marker also becomes a `decision` need.
- Thread replies aren't fetched: only top-level messages and replies broadcast to the channel are collected.

**Permalinks:** built once per run from [`auth.test`](https://docs.slack.dev/reference/methods/auth.test)'s `url`, as `<url>archives/<channel>/p<ts without the dot>`. That's the shape Slack's permalinks have. Folio doesn't call [`chat.getPermalink`](https://docs.slack.dev/reference/methods/chat.getPermalink) because that's one rate-limited call per message, which a busy channel would exhaust. The trade-off is that the link format comes from observed Slack behavior rather than a documented contract.

---

## ClickUp

| Variable | Required | Meaning |
| --- | --- | --- |
| `CLICKUP_TOKEN` | yes | Personal API token (`pk_…`). It is sent as-is in `Authorization`, with no `Bearer` ([authentication](https://developer.clickup.com/docs/authentication)). |
| `CLICKUP_TEAM_ID` | yes | Workspace ID: the number after `app.clickup.com/` |

**What it collects:** [`GET /api/v2/team/{team_id}/task`](https://developer.clickup.com/reference/getfilteredteamtasks) with these parameters:

- `date_updated_gt`/`date_updated_lt` (ms) set to the day;
- `include_closed=true`, `subtasks=true`, `order_by=updated`;
- `page` from 0 up.

ClickUp documents 100 tasks per page, so Folio stops at the first page with fewer than 100. Every task updated during the day becomes a fact:

- status type `closed` or `done` → `done`;
- a status name containing "block" → `blocked`;
- otherwise → `info`.

`url` is `task.url`, `actor` is the first assignee's username, `project` is `list.name`, and `label` is the status name. The cheap check is [`GET /api/v2/user`](https://developer.clickup.com/reference/getauthorizeduser).

**Rate limits:** [100 requests/min](https://developer.clickup.com/docs/rate-limits) on most plans. A `429` carries `X-RateLimit-Reset`, which the retry honors.

---

## Notion

| Variable | Required | Meaning |
| --- | --- | --- |
| `NOTION_TOKEN` | yes | [Internal integration](https://developers.notion.com/docs/authorization) secret with the *Read content* capability. Share the pages or databases to follow with the integration, because it only sees what is shared with it. |

**API version:** every request sends `Notion-Version: 2022-06-28`. Newer versions exist (2026-03-11 at the time of writing), and they rename databases to data sources in search results. Folio searches only pages, which works the same way in both.

**What it collects:** [`POST /v1/search`](https://developers.notion.com/reference/post-search) with these parameters:

- `filter: { property: 'object', value: 'page' }`;
- `sort: { timestamp: 'last_edited_time', direction: 'descending' }`;
- `page_size: 100`.

Folio follows `next_cursor` until results were last edited before the day. Every page edited during the day becomes an `info` fact:

- `kind` is `page.created` when the page was also created that day, `page.edited` otherwise;
- the title comes from the page's `title` property;
- `url` is `page.url`;
- `actor` is `last_edited_by.id`, a Notion user ID. Map it to an agent with `FOLIO_AGENT_ALIASES=notion:<id>=<agent>`.

The cheap check is [`GET /v1/users/me`](https://developers.notion.com/reference/get-self).

**Limits:**

- Notion rounds `last_edited_time` to the minute.
- Search isn't guaranteed to be exhaustive or immediately up to date, so a page edited seconds before the run may show up on the next one.
