"""Score the engine against dataset/sample_output.csv.  Usage: py evaluate.py [-v]"""
import csv
import json
import sys
from pathlib import Path

from audit.engine import Auditor

DS = Path(__file__).resolve().parent.parent / "dataset"
KEYS = ("phase", "system_id", "resource_id", "operation", "state", "evidence_id")


def evaluate(auditor=None, verbose=False):
    if auditor is None:
        from audit.ai import read_image
        auditor = Auditor(DS, read_image)
        auditor.match_orphans(auditor.requests("sample_deletion_requests.csv") + auditor.requests())
    gold = {r["case_id"]: r for r in csv.DictReader(open(DS / "sample_output.csv", encoding="utf-8"))}
    status_ok = exact = 0
    report = []
    for req in auditor.requests("sample_deletion_requests.csv"):
        g = gold.get(req["case_id"])
        if not g:
            continue
        res = auditor.audit(req)
        gs = [tuple(s.get(k, "") for k in KEYS) for s in sorted(json.loads(g["steps_json"]), key=lambda s: s["step_no"])]
        ms = [tuple(s[k] for k in KEYS) for s in res["steps"]]
        s_ok = res["deletion_status"] == g["deletion_status"]
        status_ok += s_ok
        exact += s_ok and gs == ms
        report.append({"case_id": req["case_id"], "status_match": s_ok, "steps_match": gs == ms})
        if verbose and (not s_ok or gs != ms):
            print(f"--- {req['case_id']} gold={g['deletion_status']} ours={res['deletion_status']} user={res['user_id']}")
            for x in gs:
                print("   G", *x, "" if x in ms else "   <-- missing")
            for x in ms:
                if x not in gs:
                    print("   O", *x, "   <-- extra")
    n = len(report)
    summary = {"cases": n, "status_accuracy": status_ok / n, "exact_match": exact / n, "cases_detail": report}
    print(f"status accuracy {status_ok}/{n}   exact step match {exact}/{n}")
    return summary


if __name__ == "__main__":
    evaluate(verbose="-v" in sys.argv)
