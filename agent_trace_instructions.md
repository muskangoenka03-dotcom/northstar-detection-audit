# Agent trace

Every run of `code/run_audit.py` overwrites `log.txt` at the repository root with a trace of what the agent did. The trace holds only case ids, user ids and counts, never names, emails or phone numbers, so it is safe to commit.

## Format

A header of `key=value` lines, a blank line, then one line per audited request:

```
run_at=2026-11-05T06:09:45Z
summary=518 requests audited in 27.0s: 167 COMPLETE, 351 INCOMPLETE
evaluation=status_accuracy 100.00%, exact_match 93.75% on 32 sample cases
ai_screenshot_reads=5 unread=6

case_33 user=user_18 status=INCOMPLETE findings=1 remediations=1 verifications=3 records=3 inferred_link=no
```

| Field | Meaning |
| --- | --- |
| `run_at` | UTC time the run finished |
| `summary` | Requests audited, run time, verdict counts |
| `evaluation` | Scores on the labelled sample cases (`evaluation/evaluate.py`) |
| `ai_screenshot_reads` / `unread` | Screenshots turned into records by Claude vision (cached), and those left unread because no `ANTHROPIC_API_KEY` was set |
| `user` | Subject resolved for the request |
| `status` | `COMPLETE` or `INCOMPLETE` |
| `findings` / `remediations` / `verifications` | Number of steps in each phase of the plan |
| `records` | Records in the subject's footprint (identity web) |
| `inferred_link` | `yes` when a record was tied to the request by activity timing rather than an identifier, so it deserves a human look |

## Where the AI acts

The agent is deterministic except for two calls in `code/audit/ai.py`:

1. **Screenshot reading** during the run. Results are cached by image hash in `code/ai_cache.json`, so a re-run makes no new calls.
2. **"Explain verdict"** in the dashboard, on demand. It explains a verdict and never changes it.

## Reproducing a trace

```powershell
py code\run_audit.py          # writes output.csv, log.txt, code\results.json
```

The same dataset and cache always produce the same `output.csv` and the same per-case lines. Only `run_at` and the run time change.
