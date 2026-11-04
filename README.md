# Northstar Deletion Audit Agent

An evidence-driven agent that checks whether "deleted" customer data is really gone.

Northstar Shop marks deletion requests as completed, but copies of the data can survive in search indexes, support tickets, analytics, sync pipelines and backups. This project audits every deletion request against the evidence each system left behind. For each request it:

- resolves the subject's **current and historical identifiers** (old emails, phones, email hashes, reassigned addresses)
- reconstructs their **activity across systems** from databases, exports, logs, documents and screenshots
- decides whether the deletion is **COMPLETE** or **INCOMPLETE**
- emits ordered **FINDING → REMEDIATION → VERIFICATION** steps (delete / redact / anonymize, or verification checks)
- respects **retention rules and legal holds**, and keeps **tombstones** that hold only `user_id`

The output is `dataset/output.csv` with the columns `case_id, deletion_status, steps_json`, and an investigation dashboard for reviewing every case.

## Results

On the labelled sample set: **32/32** status accuracy and **30/32** exact step-sequence match. The two misses expect audit records that exist in none of the supplied evidence. A full run covers 518 requests in about 30 seconds.

## Architecture

```
dataset/  (CSV + evidence: SQL, JSON, logs, PDFs, images)
   │
   ▼
parsers.py ──► observations ──► engine.py ──► output.csv / results.json
   ▲                               │
ai.py (Claude vision, cached)      ▼
                              graph.py (identity graph) ──► api.py (FastAPI) ──► Next.js dashboard
```

| Component | Role |
| --- | --- |
| `backend/audit/parsers.py` | Normalises SQL snapshots, JSON exports, five log dialects, handover text and PDFs into per-resource observations |
| `backend/audit/engine.py` | Identity resolution, resource state at audit time, deletion rules, retention, resurrection and replica-drift detection, step ordering |
| `backend/audit/graph.py` | Identity graph linking users → identifiers → resources; computes each subject's footprint and the per-case graph shown in the UI |
| `backend/audit/ai.py` | The only model calls: Claude vision for screenshots and on-demand verdict explanations, both cached |
| `backend/run_audit.py` | Batch run → `dataset/output.csv` + `backend/results.json` |
| `backend/evaluate.py` | Scores output against `sample_output.csv` (`-v` prints diffs) |
| `backend/api.py` | FastAPI adapter serving results to the dashboard |
| `src/` | Next.js 15 + Tailwind + Recharts dashboard: overview, case register, case detail with identity graph, findings, remediation, evidence, reports |

### Where AI is used

The audit is deterministic and runs offline: parsing, identity resolution and verdicts are rule-based, which keeps them reproducible and auditable. Claude is used only where rules can't help:

1. **Reading screenshot evidence:** console screenshots are converted to structured records with Claude vision.
2. **Explaining a verdict:** the "Explain verdict" button on a case page.

Both results are cached by content hash, so each image is read at most once.

### What the engine detects

- **Identity history:** old emails, phones and hashes from `user_audit_log.csv`, including emails later reassigned to someone else
- **Resurrection:** sync or restore jobs that repopulate a resource after it was deleted
- **Replica drift:** records that survive in failover or read replicas
- **Restorable backups:** backups still eligible for restore
- **Retention:** security audit records within their retention period, and legal holds
- **Inferred links:** account deletes with no identifier in any evidence are paired by activity timing and flagged as `inferredLinks`

## Getting started

### Requirements

- Python 3.11+
- Node.js 20.9+ and npm
- The Northstar dataset (not included; see [Data](#data))
- Optional: `ANTHROPIC_API_KEY`, needed for screenshot reading and verdict explanations

### Run everything

```powershell
.\start.ps1            # install deps, audit all requests, start API (:8000) and dashboard (:3000)
.\start.ps1 -SkipAudit # reuse the previous backend/results.json
```

Open http://localhost:3000.

### Run pieces separately

```powershell
cd backend
py -m pip install -r requirements.txt
py run_audit.py                       # writes dataset/output.csv and backend/results.json
py evaluate.py -v                     # score against dataset/sample_output.csv
py -m uvicorn api:app --port 8000     # API

cd ..
copy .env.example .env.local          # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm install
npm run build; npm run start          # dashboard on http://localhost:3000
```

### Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | backend env | Enables screenshot reading and verdict explanations |
| `AUDIT_MODEL` | backend env | Claude model ID (defaults to `claude-sonnet-5-5`) |
| `API_PUBLIC_URL` | backend env | Base URL used in evidence links (defaults to `http://localhost:8000`) |
| `NEXT_PUBLIC_API_BASE_URL` | `.env.local` | API origin used by the dashboard |

## Data

The input dataset contains personal information (names, emails, phone numbers), so it is **not** committed. Place it under `dataset/`:

```
dataset/
  deletion_requests.csv   sample_deletion_requests.csv   sample_output.csv
  user_identities.csv     user_audit_log.csv             system_activity.csv
  deletion_rules.csv      evidence_files.csv
  evidence/               (PDFs, images, logs, JSON, SQL)
```

Only the generated `dataset/output.csv` is versioned. The screenshot cache (`backend/ai_cache.json`) and full results (`backend/results.json`) are also excluded because they contain extracted personal data.

## API

| Route | Returns |
| --- | --- |
| `GET /api/health` | Service status |
| `GET /api/dashboard` | Summary metrics and chart series |
| `GET /api/cases`, `/api/cases/{id}` | Case list; case detail with steps, evidence and identity graph |
| `GET /api/cases/{id}/explanation` | AI-generated verdict explanation |
| `GET /api/evidence`, `/api/findings`, `/api/remediation` | Cross-case evidence, findings and remediation steps |
| `GET /api/reports`, `/api/reports/output.csv`, `/api/reports/evaluation` | Report summary, raw output CSV, evaluation scores |

## Project presentation

`Ghost_Data_Audit_Agent.pptx` is a short animated deck explaining the problem, the approach and how the system works.

## Authors

- Muskan Goenka
- Arshia
