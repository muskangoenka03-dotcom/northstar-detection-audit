# Architecture

A plain-language, animated version with worked examples is in [`system_design.html`](system_design.html). Open it in a browser. The presentation is [`Ghost_Data_Audit_Agent.pptx`](Ghost_Data_Audit_Agent.pptx).

```
 Layer 1  INPUTS      dataset/  requests · identities · identity history · rules · evidence (SQL, JSON, logs, PDF, images)
              │
 Layer 2  READING     code/audit/parsers.py ──┐
                      code/audit/ai.py ───────┴─► observations {evidence_id, captured_at, observed_at, resource_id, system, attrs}
              │        (Claude vision, cached)
 Layer 3  THINKING    engine.Identities  → every email / phone / hash, time-aware
                      graph.IdentityGraph → footprint: records reachable from the person
                      engine.Auditor      → state at audit time → rules / retention / legal hold
                                          → resurrection · replica drift · restorable backups
                                          → verdict + ordered FINDING → REMEDIATION → VERIFICATION
              │
 Layer 4  RESULTS     code/run_audit.py → output.csv · log.txt · code/results.json
              │
 Layer 5  SHARING     code/api.py (FastAPI, read-only) → code/dashboard (Next.js) → privacy team
                                                       └► "Explain verdict" (Claude, cached)
```

Each layer only reads from the one above it. Parsers never see users, the engine never sees HTTP, and nothing downstream of layer 4 can change a verdict.

## Step order contract

| Phase | Order |
| --- | --- |
| FINDING | by system |
| REMEDIATION | `DISABLE_DATA_FLOW → BLOCK_RESTORE → DELETE → REDACT → ANONYMIZE` (stop the source before cleaning) |
| VERIFICATION | `ABSENT` (account first) `→ PRESENT → REDACTED → ANONYMIZED → DISABLED → BLOCKED` |

## Known limitations

- `Identities.resolve()` starts from each user's current email. When an email was later handed to a second user, a lookup *before* the handover can name the second user. The test for this case is marked as an expected failure in `tests/test_identity_graph.py`. It doesn't affect the current dataset's scores.
- Six screenshots are read only when `ANTHROPIC_API_KEY` is set.
- Account deletes with no identifier in any evidence are paired with requests by timing, and flagged as `inferred_link` in `log.txt`.
