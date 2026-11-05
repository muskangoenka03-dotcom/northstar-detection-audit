# Problem statement

Northstar Shop (an imaginary company) lost $2.4 million after one supposedly deleted customer came back as a ghost in its systems. Every internal dashboard showed the deletion request as “Complete.” Weeks later, the same customer tried to create a new account. The platform refused: “This email is already registered.”

What looked like a simple signup bug exposed a much larger failure. The investigation uncovered personal data across secondary databases, support attachments, search indexes, analytics exports, logs, archives, and backups. A synchronization job had even recreated information that the primary account service had successfully deleted.

Northstar Shop now needs an AI-powered deletion audit agent that can prove whether a user's personal data is truly gone before another failure causes financial and reputational damage.

For deletion requests, the agent must investigate the supplied records, determine the user's current and historical identifiers, reconstruct what happened across systems, and decide whether the deletion is actually complete.

When data remains, the agent must produce the ordered remediation steps required to remove, redact, or anonymize it. When deletion has already been completed, the agent must produce the checks that prove it. The agent must also preserve records that the supplied policy requires the organization to retain.

Some systems preserve an account tombstone so permitted records can continue to reference the same internal user_id. In these records, the stable user reference may remain, but direct identifiers such as name, email, phone, and email hash must be removed.

## Files provided

All participant-facing files are inside `dataset/`.

| File | Contents |
| --- | --- |
| `deletion_requests.csv` | Requests that must be audited |
| `sample_deletion_requests.csv` | Sample requests |
| `sample_output.csv` | Correct answers for the sample requests |
| `user_identities.csv` | Current user identities |
| `user_audit_log.csv` | Historical identity changes |
| `system_activity.csv` | Deletion, sync, export, backup, restore, indexing, and related operational activity |
| `deletion_rules.csv` | Required treatment for each data category |
| `evidence_files.csv` | Manifest of the supplied evidence files |
| `output.csv` | Blank submission template |

Evidence may be stored as PDFs, images, logs, JSON, or SQLite-compatible SQL snapshot exports under `dataset/evidence/`.

## Required output

`output.csv` with columns `case_id, deletion_status, steps_json`.
