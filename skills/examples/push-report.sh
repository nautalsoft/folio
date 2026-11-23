#!/usr/bin/env bash
# Push a report to Folio.
#
# Usage:
#   FOLIO_URL=https://folio.example.com FOLIO_INGEST_TOKEN=YOUR_TOKEN \
#     ./push-report.sh "Title of the task" "What changed, in two or three sentences." [done|blocked|waiting|info] [url]
#
# Optional environment:
#   FOLIO_AGENT_ID    stable agent id            (default: the host name)
#   FOLIO_AGENT_NAME  display name               (default: the agent id)
#   FOLIO_AGENT_KIND  t3code | claude-code | codex | grok | cloud | other (default: other)
#   FOLIO_REPORT_KEY  idempotency key: same key = update the same report
#   FOLIO_PROJECT     project name
#   FOLIO_PROTECTION_BYPASS  Vercel "Protection Bypass for Automation" secret, if the instance is protected
#
# Requires bash and curl only. Exits non-zero if the request fails or Folio answers with an error.
set -euo pipefail

: "${FOLIO_URL:?Set FOLIO_URL, for example https://folio.example.com}"
title="${1:?Usage: push-report.sh TITLE [SUMMARY] [STATUS] [URL]}"
summary="${2:-}"
status="${3:-done}"
url="${4:-}"

case "$status" in done|blocked|waiting|info) ;; *) echo "status must be done, blocked, waiting or info" >&2; exit 2 ;; esac

agent_id="${FOLIO_AGENT_ID:-$(hostname)}"
agent_name="${FOLIO_AGENT_NAME:-$agent_id}"
agent_kind="${FOLIO_AGENT_KIND:-other}"

# Minimal JSON string escaping (backslash, quote, control characters), so no jq is needed.
json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '"%s"' "$s"
}

optional() { # optional "key" "value" -> , "key": "value"   (nothing when value is empty)
  if [ -n "$2" ]; then printf ', "%s": %s' "$1" "$(json "$2")"; fi
}

item=""
if [ -n "$url" ]; then
  item="{ \"text\": $(json "$title"), \"status\": $(json "$status"), \"url\": $(json "$url") }"
fi

body=$(cat <<JSON
{
  "agent": { "id": $(json "$agent_id"), "name": $(json "$agent_name"), "kind": $(json "$agent_kind") },
  "title": $(json "$title"),
  "summary": $(json "$summary"),
  "status": $(json "$status"),
  "items": [ $item ]$(optional key "${FOLIO_REPORT_KEY:-}")$(optional project "${FOLIO_PROJECT:-}")
}
JSON
)

auth=()
if [ -n "${FOLIO_INGEST_TOKEN:-}" ]; then auth=(-H "Authorization: Bearer $FOLIO_INGEST_TOKEN"); fi
# Instances behind Vercel Deployment Protection need a "Protection Bypass for Automation" secret.
if [ -n "${FOLIO_PROTECTION_BYPASS:-}" ]; then auth+=(-H "x-vercel-protection-bypass: $FOLIO_PROTECTION_BYPASS"); fi

response=$(mktemp)
trap 'rm -f "$response"' EXIT

code=$(curl -sS -o "$response" -w '%{http_code}' -X POST "${FOLIO_URL%/}/api/ingest/report" \
  ${auth[@]+"${auth[@]}"} -H "Content-Type: application/json" --data-binary "$body")

if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
  echo "Folio answered HTTP $code:" >&2
  cat "$response" >&2
  echo >&2
  exit 1
fi

cat "$response"
echo
