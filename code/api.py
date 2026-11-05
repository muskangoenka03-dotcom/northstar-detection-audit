"""Thin FastAPI adapter: serves code/results.json (written by run_audit.py) in the dashboard's contract.

Usage (from code/): py -m uvicorn api:app --port 8000
"""
import json
import os
from collections import Counter
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

ROOT = Path(__file__).resolve().parent
DS = ROOT.parent / "dataset"
RESULTS = ROOT / "results.json"
PUBLIC_URL = os.environ.get("API_PUBLIC_URL", "http://localhost:8000").rstrip("/")   # evidence links open from the dashboard origin

app = FastAPI(title="Northstar deletion audit API")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["GET"], allow_headers=["*"])

FINDING_SEVERITY = {"REPORT_RESTORE_RISK": "CRITICAL", "REPORT_ACTIVE_DATA_FLOW": "CRITICAL",
                    "REPORT_REMAINING_RECORD": "HIGH", "REPORT_EXPOSED_PII": "MEDIUM"}
SEVERITY_RANK = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
VERB = {"DELETE_RECORD": "Delete", "REDACT_RECORD": "Redact direct identifiers in", "ANONYMIZE_RECORD": "Anonymize",
        "DISABLE_DATA_FLOW": "Disable data flow", "BLOCK_RESTORE": "Block restore access to"}
FINDING_TEXT = {"REPORT_REMAINING_RECORD": "{r} still exists in {s} after the deletion was reported",
                "REPORT_EXPOSED_PII": "{r} in {s} still holds direct identifiers of the subject",
                "REPORT_ACTIVE_DATA_FLOW": "{r} in {s} is still enabled and can re-sync the subject's data",
                "REPORT_RESTORE_RISK": "{r} in {s} can still be restored, which would resurrect the subject's data"}
VERIFY_TEXT = {"ABSENT": "Confirm {r} is absent from {s}", "PRESENT": "Confirm retained record {r} in {s} is preserved",
               "REDACTED": "Confirm {r} in {s} holds no direct identifiers", "ANONYMIZED": "Confirm {r} in {s} is no longer attributable",
               "DISABLED": "Confirm {r} in {s} is disabled", "BLOCKED": "Confirm restore of {r} in {s} is blocked"}

_cache = {"mtime": None, "data": None}


def data():
    if not RESULTS.exists():
        raise HTTPException(503, "No audit results yet. Run `py run_audit.py` in backend/.")
    m = RESULTS.stat().st_mtime
    if _cache["mtime"] != m:
        _cache["data"] = json.loads(RESULTS.read_text(encoding="utf-8"))
        _cache["mtime"] = m
        _cache["by_id"] = {c["case_id"]: c for c in _cache["data"]["cases"] + _cache["data"]["samples"]}
    return _cache["data"]


def risk(case):
    sev = [FINDING_SEVERITY[s["operation"]] for s in case["steps"] if s["phase"] == "FINDING"]
    return min(sev, key=SEVERITY_RANK.index) if sev else "LOW"


def case_record(c):
    hist = [h for h in c["identity"]["history"] if h["field_name"] == "email"]
    return {"caseId": c["case_id"], "currentUserId": c["user_id"],
            "historicalUserId": ", ".join(h["old_value"] for h in hist) or None,
            "requestType": "DELETION", "auditTimestamp": c["request"]["audit_at"],
            "deletionStatus": c["deletion_status"], "riskLevel": risk(c),
            "investigationStatus": "VERIFIED" if c["deletion_status"] == "COMPLETE" else "REMEDIATION_REQUIRED"}


def findings_of(c):
    return [{"findingId": f"{c['case_id']}-F{s['step_no']}", "caseId": c["case_id"],
             "description": FINDING_TEXT[s["operation"]].format(r=s["resource_id"], s=s["system_id"]),
             "evidenceReference": s["evidence_id"] or None, "violationCategory": s["operation"].replace("REPORT_", ""),
             "severity": FINDING_SEVERITY[s["operation"]], "detectedAt": c["request"]["audit_at"]}
            for s in c["steps"] if s["phase"] == "FINDING"]


def remediation_of(c):
    return [{"stepNumber": s["step_no"], "type": "REMEDIATION", "caseId": c["case_id"],
             "description": f"{VERB[s['operation']]} {s['resource_id']} ({s['system_id']}) -> {s['state']}",
             "evidenceReference": None, "completionStatus": "PENDING"}
            for s in c["steps"] if s["phase"] == "REMEDIATION"]


def evidence_record(ev, case_id=None):
    p = DS / ev["file_path"]
    return {"evidenceId": ev["file_id"], "caseId": case_id, "name": p.name, "category": p.parent.name,
            "fileType": p.suffix.lstrip(".").upper(), "sizeBytes": p.stat().st_size if p.exists() else None,
            "modifiedAt": ev["captured_at"], "source": ev["origin"],
            "previewUrl": f"{PUBLIC_URL}/api/evidence/{ev['file_id']}/file", "downloadUrl": f"{PUBLIC_URL}/api/evidence/{ev['file_id']}/file"}


@app.get("/api/health")
def health():
    return {"status": "ok" if RESULTS.exists() else "no_results"}


@app.get("/api/dashboard")
def dashboard():
    d = data()
    cases = d["cases"]
    ops = Counter(s["operation"] for c in cases for s in c["steps"])
    sev = Counter(risk(c) for c in cases)
    systems = Counter(s["system_id"] for c in cases for s in c["steps"] if s["phase"] == "FINDING")
    ev_used = Counter(d_["evidence_id"] for c in cases for d_ in c["steps"] if d_["evidence_id"])
    origin = {e["file_id"]: e["file_path"].split("/")[1] for e in d["evidence"]}
    by_cat = Counter()
    for k, v in ev_used.items():
        by_cat[origin.get(k, "other")] += v
    return {"totalCases": len(cases), "casesAnalyzed": len(cases),
            "deletedDataDetected": sum(c["deletion_status"] == "INCOMPLETE" for c in cases),
            "activeSyncRisks": ops["REPORT_ACTIVE_DATA_FLOW"], "backupRestoreRisks": ops["REPORT_RESTORE_RISK"],
            "pendingRemediations": sum(1 for c in cases for s in c["steps"] if s["phase"] == "REMEDIATION"),
            "analysisStatus": [{"name": k, "value": v} for k, v in Counter(c["deletion_status"] for c in cases).items()],
            "violationTypes": [{"name": k, "value": v} for k, v in systems.most_common()],
            "evidenceSources": [{"name": k, "value": v} for k, v in by_cat.most_common()],
            "remediationStatus": [{"name": k.replace("_", " ").title(), "value": ops[k]} for k in
                                  ("DELETE_RECORD", "REDACT_RECORD", "ANONYMIZE_RECORD", "DISABLE_DATA_FLOW", "BLOCK_RESTORE") if ops[k]],
            "riskSeverity": [{"name": k, "value": sev[k]} for k in SEVERITY_RANK if sev[k]],
            "updatedAt": d["generated_at"]}


@app.get("/api/cases")
def cases():
    items = [case_record(c) for c in data()["cases"]]
    return {"items": items, "total": len(items)}


@app.get("/api/cases/{case_id}")
def case_detail(case_id: str):
    data()
    c = _cache["by_id"].get(case_id)
    if not c:
        raise HTTPException(404, f"Unknown case {case_id}")
    d = data()
    evmap = {e["file_id"]: e for e in d["evidence"]}
    cited = sorted({i["evidence_id"] for i in c["items"] if i["evidence_id"]} | {s["evidence_id"] for s in c["steps"] if s["evidence_id"]})
    req = c["request"]
    timeline = [{"timestamp": req["requested_at"], "description": "Deletion request received", "source": "privacy_intake"},
                {"timestamp": req["reported_at"], "description": f"Deletion reported as {req['reported_status']}", "source": "deletion_dashboard"}]
    timeline += [{"timestamp": h["event_time"], "description": f"{h['field_name']} changed from {h['old_value']} to {h['new_value']}",
                  "source": "user_audit_log"} for h in c["identity"]["history"]]
    for i in c["items"]:
        timeline += [{"timestamp": a["event_time"], "description": f"{a['event_type']} {i['resource_id']}: {a['reported_result']} - {a['details']}",
                      "source": a["source_system"]} for a in i["activity"]]
        if i["observed_at"]:
            timeline.append({"timestamp": i["observed_at"], "description": f"Evidence {i['evidence_id']} shows {i['resource_id']} "
                             f"{'compliant' if i['ok'] else 'NON-COMPLIANT'} (target {i['state']})", "source": i["evidence_id"]})
    timeline.append({"timestamp": req["audit_at"], "description": f"Audit verdict: {c['deletion_status']}", "source": "deletion_audit_agent"})
    rules = {r["data_category"]: r for r in d["rules"]}
    return {
        "case": case_record(c),
        "deletionRequest": {**req, "resolvedUser": c["user_id"], "subjectName": c["identity"]["name"],
                            "knownEmails": c["identity"]["emails"],
                            "inferredLinks": [i["resource_id"] for i in c["items"] if i["inferred"]]},
        "evidence": [evidence_record(evmap[e], case_id) for e in cited if e in evmap],
        "activity": sorted(timeline, key=lambda t: t["timestamp"] or ""),
        "policies": [{"name": f"{r['rule_id']} {r['data_category']}", "description": f"{r['condition']} -> {r['required_action']}"}
                     for r in rules.values()],
        "synchronizationRisks": [{"description": f"{i['resource_id']} is {'still enabled' if not i['ok'] else 'disabled'}",
                                  "status": "OPEN" if not i["ok"] else "MITIGATED"} for i in c["items"] if i["system"] == "integration_service"],
        "backupRisks": [{"description": f"{i['resource_id']} restore {'still allowed' if not i['ok'] else 'blocked'}",
                         "status": "OPEN" if not i["ok"] else "MITIGATED"} for i in c["items"] if i["system"] == "backup_service"],
        "findings": findings_of(c),
        "remediation": remediation_of(c),
        "verification": [{"description": VERIFY_TEXT[s["state"]].format(r=s["resource_id"], s=s["system_id"]),
                          "status": "VERIFIED" if s["evidence_id"] else "PENDING", "evidenceReference": s["evidence_id"] or None}
                         for s in c["steps"] if s["phase"] == "VERIFICATION"],
        "steps": c["steps"],
        "graph": c.get("graph") or {"nodes": [], "edges": []},
    }


@app.get("/api/cases/{case_id}/explanation")
def case_explanation(case_id: str):
    """AI summary on demand (cached); null when no API key is configured."""
    from audit.ai import explain_case
    data()
    c = _cache["by_id"].get(case_id)
    if not c:
        raise HTTPException(404, f"Unknown case {case_id}")
    return {"explanation": explain_case(c)}


@app.get("/api/evidence")
def evidence():
    return {"items": [evidence_record(e) for e in data()["evidence"]]}


@app.get("/api/evidence/{evidence_id}/file")
def evidence_file(evidence_id: str):
    ev = next((e for e in data()["evidence"] if e["file_id"] == evidence_id), None)
    path = (DS / ev["file_path"]).resolve() if ev else None
    if not path or not path.is_file() or DS.resolve() not in path.parents:
        raise HTTPException(404, "Evidence file not found")
    return FileResponse(path, filename=path.name)


@app.get("/api/findings")
def findings():
    return {"items": [f for c in data()["cases"] for f in findings_of(c)]}


@app.get("/api/remediation")
def remediation():
    return {"items": [s for c in data()["cases"] for s in remediation_of(c)]}


@app.get("/api/reports")
def reports():
    d = data()
    cases = d["cases"]
    ops = Counter(s["operation"] for c in cases for s in c["steps"])
    ev = d.get("evaluation") or {}
    return {"totalCasesProcessed": len(cases),
            "findingsBySeverity": [{"name": k, "value": v} for k, v in Counter(f["severity"] for c in cases for f in findings_of(c)).items()],
            "policyCompliance": [{"name": "Compliant", "value": sum(c["deletion_status"] == "COMPLETE" for c in cases)},
                                 {"name": "Non-compliant", "value": sum(c["deletion_status"] != "COMPLETE" for c in cases)}],
            "remediationProgress": [{"name": k.replace("_", " ").title(), "value": ops[k]} for k in
                                    ("DISABLE_DATA_FLOW", "BLOCK_RESTORE", "DELETE_RECORD", "REDACT_RECORD", "ANONYMIZE_RECORD") if ops[k]],
            "verificationOutcomes": [{"name": k.replace("VERIFY_", "").replace("_", " ").title(), "value": v}
                                     for k, v in ops.items() if k.startswith("VERIFY_")],
            "generatedAt": d["generated_at"], "evaluationAvailable": bool(ev)}


@app.get("/api/reports/output.csv")
def output_csv():
    return FileResponse(ROOT.parent / "output.csv", media_type="text/csv", filename="output.csv")


@app.get("/api/reports/evaluation")
def evaluation_report():
    ev = data().get("evaluation")
    if not ev:
        raise HTTPException(404, "No evaluation available")
    return JSONResponse(ev, headers={"Content-Disposition": 'attachment; filename="evaluation.json"'})
