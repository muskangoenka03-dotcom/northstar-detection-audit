"""Audit every deletion request and write output.csv, log.txt (repo root) and code/results.json.

Usage: py code/run_audit.py
"""
import csv
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DS = REPO / "dataset"
sys.path.insert(0, str(REPO / "evaluation"))

from audit.ai import read_image  # noqa: E402
from audit.engine import Auditor  # noqa: E402
from evaluate import evaluate  # noqa: E402


def _clean(result):
    """JSON-safe copy of an audit result for the API (drops raw observations)."""
    items = [{"resource_id": i["rid"], "system": i["system"], "state": i["state"], "ok": i["ok"],
              "action": i["action"], "evidence_id": i["evidence"], "inferred": i.get("inferred", False),
              "path": i.get("path", []),
              "observed_at": i["obs"]["observed_at"] if i["obs"] else None,
              "observation": {k: v for k, v in (i["obs"] or {}).get("attrs", {}).items()
                              if v is not None and not k.startswith("_")},
              "activity": [{k: a[k] for k in ("activity_id", "event_time", "event_type", "source_system",
                                               "target_system", "reported_result", "details")} for a in i["acts"]]}
             for i in result["items"]]
    user = result["user"] or {}
    return {"case_id": result["case_id"], "user_id": result["user_id"], "deletion_status": result["deletion_status"],
            "request": result["request"], "steps": result["steps"], "items": items, "graph": result.get("graph"),
            "identity": {"name": user.get("name"), "emails": sorted(e for e in user.get("emails", ()) if e),
                         "history": user.get("history", [])}}


def main():
    t0 = time.time()
    auditor = Auditor(DS, read_image)
    requests = auditor.requests()
    samples = auditor.requests("sample_deletion_requests.csv")
    auditor.match_orphans(samples + requests)
    results = [auditor.audit(r) for r in requests]

    with open(REPO / "output.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["case_id", "deletion_status", "steps_json"])
        for r in results:
            w.writerow([r["case_id"], r["deletion_status"], json.dumps(r["steps"], separators=(",", ":"))])

    evaluation = evaluate(auditor)
    (ROOT / "results.json").write_text(json.dumps({
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cases": [_clean(r) for r in results],
        "samples": [_clean(auditor.audit(r)) for r in samples],
        "evaluation": evaluation,
        "evidence": list(auditor.evidence.values()),
        "rules": auditor.rules,
        "unread_images": [k for k, v in auditor.texts.items() if str(v).startswith("[unread")],
    }, default=str), encoding="utf-8")
    done = sum(r["deletion_status"] == "COMPLETE" for r in results)
    summary = f"{len(results)} requests audited in {time.time() - t0:.1f}s: {done} COMPLETE, {len(results) - done} INCOMPLETE"
    _write_trace(auditor, results, evaluation, summary)
    print(summary)
    print(f"wrote {REPO / 'output.csv'} and {REPO / 'log.txt'}")


def _write_trace(auditor, results, evaluation, summary):
    """Agent trace (format in agent_trace_instructions.md): run header, AI usage, then one line per case."""
    images = [k for k in auditor.texts if auditor.evidence[k]["file_path"].lower().endswith((".png", ".jpg", ".jpeg"))]
    unread = [k for k in images if str(auditor.texts[k]).startswith("[unread")]
    lines = [f"run_at={time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}",
             f"summary={summary}",
             f"evaluation=status_accuracy {evaluation['status_accuracy']:.2%}, exact_match {evaluation['exact_match']:.2%} on {evaluation['cases']} sample cases",
             f"ai_screenshot_reads={len(images) - len(unread)} unread={len(unread)}", ""]
    for r in results:
        phases = [s["phase"] for s in r["steps"]]
        inferred = any(i.get("inferred") for i in r["items"])
        lines.append(f"{r['case_id']} user={r['user_id']} status={r['deletion_status']} "
                     f"findings={phases.count('FINDING')} remediations={phases.count('REMEDIATION')} "
                     f"verifications={phases.count('VERIFICATION')} records={len(r['items'])} inferred_link={'yes' if inferred else 'no'}")
    (REPO / "log.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
