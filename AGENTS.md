# Working on this repository

Guidance for coding agents and new contributors.

## Layout

| Path | Layer | Owns |
| --- | --- | --- |
| `code/audit/parsers.py` | Reading | Every evidence format → one observation shape |
| `code/audit/ai.py` | Reading (AI) | Screenshot reading and verdict explanations, both cached |
| `code/audit/engine.py` | Identity + decision | Identity history, record state, rules, verdicts, ordered steps |
| `code/audit/graph.py` | Identity web | Footprint per person, and the path that explains each record |
| `code/run_audit.py` | Results | Batch run → `output.csv`, `log.txt`, `code/results.json` |
| `code/api.py` | Sharing | Read-only FastAPI over `code/results.json` |
| `code/dashboard/` | Sharing | Next.js dashboard |
| `evaluation/` | | Scoring against `dataset/sample_output.csv` |
| `tests/` | | Unit tests per layer, plus a score regression test |
| `scripts/` | | `start.ps1` (everything), `run_audit.ps1` (audit, score, test) |
| `docs/` | | Architecture, system design page, presentation |

## Rules

- **Keep the layers one-way.** Parsers don't know about users, the engine doesn't know about HTTP, and the API and dashboard never change a verdict.
- **Don't change engine behaviour without checking the scores.** Run `.\scripts\run_audit.ps1`. Status accuracy must stay 32/32 and exact step match at least 30/32. If an output change is intended, explain it.
- **AI only where rules can't work.** New model calls go through `code/audit/ai.py` and must be cached.
- **Never commit personal data.** `dataset/*`, `code/ai_cache.json` and `code/results.json` are git-ignored. `output.csv` and `log.txt` hold ids only.
- **Python is run with `py`** (Windows launcher). Dependencies are in `code/requirements.txt`.

## Commands

```powershell
py code\run_audit.py                                              # audit everything
py evaluation\evaluate.py -v                                      # score, with diffs
py -W ignore::ResourceWarning -m unittest discover -s tests       # tests
cd code\dashboard; npm run typecheck; npm run build              # dashboard checks
.\scripts\start.ps1                                               # API :8000 + dashboard :3000
```
