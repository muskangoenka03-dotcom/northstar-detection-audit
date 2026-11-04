"""Audit every deletion request and write dataset/output.csv plus backend/results.json.

Usage: py run_audit.py
"""
import csv
import json
import time
from pathlib import Path

from audit.ai import read_image
from audit.engine import Auditor
from evaluate import evaluate

ROOT = Path(__file__).resolve().parent
DS = ROOT.parent / "dataset"


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

    with open(DS / "output.csv", "w", newline="", encoding="utf-8") as f:
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
    print(f"{len(results)} requests audited in {time.time() - t0:.1f}s: {done} COMPLETE, {len(results) - done} INCOMPLETE")
    print(f"wrote {DS / 'output.csv'}")


if __name__ == "__main__":
    main()
