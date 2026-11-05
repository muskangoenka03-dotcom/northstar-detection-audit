# Evaluation

`evaluate.py` audits the 32 labelled sample requests and compares the result with `dataset/sample_output.csv`. Each step is compared on phase, system, record, operation, state and evidence.

```powershell
py evaluation\evaluate.py        # scores
py evaluation\evaluate.py -v     # scores, plus every mismatching step
```

## Current scores

| Measure | Score |
| --- | --- |
| Status accuracy (COMPLETE / INCOMPLETE) | **32 / 32** |
| Exact step match (whole ordered plan) | **30 / 32** |

The two misses (`case_18`, `case_20`) expect audit records `audit_record_6645` and `audit_record_5569`, which appear in none of the supplied evidence.

`tests/test_engine.py` fails if these scores drop.
