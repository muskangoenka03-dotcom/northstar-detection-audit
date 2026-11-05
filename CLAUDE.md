# Claude instructions

Follow [AGENTS.md](AGENTS.md) for the layout, layer rules and commands.

Additionally:

- Read `problem_statement.md` before changing audit logic. The tombstone and retention rules there are easy to break.
- After any change under `code/audit/`, run `.\scripts\run_audit.ps1` and report the scores it prints.
- The model used by the agent is set with `AUDIT_MODEL` (default `claude-sonnet-5-5`). Keep calls cached in `code/ai_cache.json`.
- The trace format in `log.txt` is documented in `agent_trace_instructions.md`. Update both together.
