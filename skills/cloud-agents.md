# Folio for cloud agents and CI

Agents that run in the cloud (scheduled jobs, CI pipelines, hosted coding agents, background workers) usually can't be told "report when you're done" reliably. Add a final step to the run instead: it reports whatever happened, success or failure.

## Secrets

Store `FOLIO_URL` and `FOLIO_INGEST_TOKEN` in the platform's secret store, never in the repository or the job definition.

## GitHub Actions: a last step that always runs

```yaml
      - name: Report to Folio
        if: always()
        env:
          FOLIO_URL: ${{ secrets.FOLIO_URL }}
          FOLIO_INGEST_TOKEN: ${{ secrets.FOLIO_INGEST_TOKEN }}
          FOLIO_AGENT_ID: ci-${{ github.event.repository.name }}
          FOLIO_AGENT_NAME: CI · ${{ github.event.repository.name }}
          FOLIO_AGENT_KIND: cloud
          FOLIO_REPORT_KEY: ${{ github.workflow }}-${{ github.run_id }}
          FOLIO_PROJECT: ${{ github.event.repository.name }}
        run: |
          case "${{ job.status }}" in
            success) status=done ;;
            cancelled) status=info ;;
            *) status=blocked ;;
          esac
          ./skills/examples/push-report.sh \
            "${{ github.workflow }} on ${{ github.ref_name }}" \
            "Run ${{ github.run_number }} finished with status ${{ job.status }}." \
            "$status" \
            "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
            || echo "Folio report failed; the job result is unchanged."
```

Copy `skills/examples/push-report.sh` into your repository (or call `push-report.mjs` with Node 22+). The `|| echo` keeps a Folio outage from failing your pipeline. If you prefer the opposite, remove it: the script exits non-zero on any HTTP error.

## Any other runner

The same three lines work in any shell step:

```bash
export FOLIO_AGENT_ID=nightly-import FOLIO_AGENT_KIND=cloud FOLIO_REPORT_KEY="nightly-import-$(date +%F)"
./push-report.sh "Nightly import" "Imported 1 240 records, 3 rejected." done "https://ci.example.com/runs/1234" \
  || echo "Folio report failed"
```

## Richer reports

For more than a one-line result, post the JSON yourself to `POST $FOLIO_URL/api/ingest/report`: one item per outcome, `steps` for the pipeline's stages (`{"label": "build", "status": "done"}`, `{"label": "deploy", "status": "error", "detail": "..."}`), and `needs` when a person must approve something. See [`folio-report/SKILL.md`](folio-report/SKILL.md) and [`docs/api.md`](../docs/api.md).

## Facts instead of reports

If the run is a tool rather than an agent (a sync job, a monitor), push facts under its own source name with `POST $FOLIO_URL/api/ingest/facts`. It then gets its own chapter, and can report its own failures with `"run": {"status": "error", "message": "..."}`, which marks the day's book incomplete.

## Long-running agents

A hosted agent that works for hours on one task should also claim it and send checkpoints (`POST /api/ingest/work`), so a person can see it is alive and another agent can resume if it dies. A claim without a heartbeat for 30 minutes is shown as stale.
