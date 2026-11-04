"""Normalise every evidence format into flat observations.

An observation is one sighting of one resource in one evidence file:
    {evidence_id, captured_at, observed_at, system, resource_id, attrs}
`attrs` is a flat dict of every scalar field seen for that resource
(nested JSON is flattened, log traces are merged into their result line).
"""
import csv
import json
import re
import sqlite3
from pathlib import Path

PREFIX_SYSTEM = {
    "account": "account_service", "search": "search_service", "analytics": "analytics_platform",
    "support": "support_platform", "export": "export_service", "data_flow": "integration_service",
    "backup": "backup_service", "audit_record": "security_service", "tombstone": "identity_service",
    "marketing": "marketing_platform", "object": "object_storage", "legal_hold": "legal_service",
    "cache": "cache_service", "email": "email_delivery_service", "telemetry": "analytics_platform",
}
RID = re.compile(r"\b(" + "|".join(sorted(PREFIX_SYSTEM, key=len, reverse=True)) + r")_\d+\b")
KV = re.compile(r'([A-Za-z_][\w.]*)=("(?:[^"\\]|\\.)*"|\S+)')
TS = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ")
TRACE = re.compile(r"\b(?:tr|rb)-[\w-]+")


def system_of(rid):
    m = RID.fullmatch(rid or "")
    return PREFIX_SYSTEM[m.group(1)] if m else None


def _flatten(obj, out, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            _flatten(v, out, k if not prefix or k in out else k)
    elif isinstance(obj, list):
        out.setdefault("_list_" + prefix, json.dumps(obj))
    else:
        if prefix not in out or out[prefix] is None:
            out[prefix] = obj


def _obs(ev, rid, attrs, observed_at=None, system=None):
    attrs = {k: v for k, v in attrs.items() if k != "resource_id"}
    known = set(PREFIX_SYSTEM.values())
    system = next((s for s in (system, attrs.get("system"), attrs.get("origin_system"), attrs.get("data_store"))
                   if s in known), None) or system_of(rid)
    return {"evidence_id": ev["file_id"], "captured_at": ev["captured_at"],
            "observed_at": observed_at or ev["captured_at"], "resource_id": rid, "system": system, "attrs": attrs}


# ---------------------------------------------------------------- JSON
def parse_json(path, ev):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    out = []

    def walk(o, ctx):
        if isinstance(o, dict):
            ctx = dict(ctx)
            for k in ("data_store", "collection", "captured_at", "observed_at", "recorded_at"):
                if isinstance(o.get(k), str):
                    ctx[k] = o[k]
            if isinstance(o.get("resource_id"), str) and system_of(o["resource_id"]):
                attrs = dict(ctx)
                _flatten(o, attrs)
                ts = o.get("observed_at") or o.get("recorded_at") or ctx.get("captured_at")
                out.append(_obs(ev, o["resource_id"], attrs, ts, ctx.get("system_hint")))
                return
            for k, v in o.items():
                c2 = dict(ctx)
                if k in PREFIX_SYSTEM.values():
                    c2["system_hint"] = k
                walk(v, c2)
        elif isinstance(o, list):
            for x in o:
                walk(x, ctx)

    walk(data, {})
    # Snapshot bundles list every record held by a store: a known store with
    # an empty record list is positive evidence that its records are absent.
    for snap in data.get("snapshots", []) if isinstance(data, dict) else []:
        out.append({"evidence_id": ev["file_id"], "captured_at": ev["captured_at"],
                    "observed_at": snap.get("captured_at", ev["captured_at"]), "resource_id": None,
                    "system": snap.get("data_store"), "attrs": {"collection": snap.get("collection")},
                    "scope": True})
    return out


# ---------------------------------------------------------------- SQL
def parse_sql(path, ev):
    db = sqlite3.connect(":memory:")
    db.executescript(Path(path).read_text(encoding="utf-8"))
    out = []
    tables = [r[0] for r in db.execute("select name from sqlite_master where type='table'")]
    scope = {}
    if "snapshot_scope" in tables:
        scope = dict(db.execute("select origin_system, captured_at from snapshot_scope"))
    for t in tables:
        cols = [c[1] for c in db.execute(f'pragma table_info("{t}")')]
        if "resource_id" not in cols:
            continue
        for row in db.execute(f'select * from "{t}"'):
            attrs = {"table": t}
            rec = dict(zip(cols, row))
            if rec.get("record_json"):
                _flatten(json.loads(rec.pop("record_json")), attrs)
            for k, v in rec.items():
                attrs.setdefault(k, v)
            o = _obs(ev, rec["resource_id"], attrs, rec.get("updated_at"))
            out.append(o)
    # A snapshot proves absence only for the stores it declares (snapshot_scope); without
    # that table, an account profile table is taken to cover the account store.
    if not scope and any("profile" in t for t in tables):
        scope = {"account_service": ev["captured_at"]}
    for sysname, ts in scope.items():
        out.append({"evidence_id": ev["file_id"], "captured_at": ev["captured_at"], "observed_at": ts,
                    "resource_id": None, "system": sysname, "attrs": {}, "scope": True})
    return out


# ---------------------------------------------------------------- logs / text
def _kv(text):
    d = {}
    for k, v in KV.findall(text):
        if v.startswith('"'):
            v = v[1:-1].replace('\\"', '"')
        d[k] = v
    return d


def parse_log(path, ev):
    out, traces = [], {}
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    for line in lines:
        ts = (TS.search(line) or [None])[0] if TS.search(line) else None
        brace = line.find("{")
        if brace != -1 and line.rstrip().endswith("}"):
            try:
                d = {k: str(v) for k, v in json.loads(line[brace:]).items()}
            except json.JSONDecodeError:
                d = _kv(line)
        else:
            d = _kv(line)
            if "message" in d:          # cloud runtime: key=value pairs nested in message="..."
                d.update(_kv(d.pop("message")))
            # bracket / pipe styles: "[INFO] [svc] [tr-1] event:" or "| INFO | svc | tr-1 | event |"
            m = re.match(r"\S+ \[(\w+)\] \[(\w+)\] \[([\w-]+)\] (\w+):", line) or \
                re.match(r"\S+ \| (\w+) \| (\w+) \| ([\w-]+) \| (\w+) \|", line)
            if m:
                d.setdefault("level", m.group(1)); d.setdefault("service", m.group(2))
                d.setdefault("trace_id", m.group(3)); d.setdefault("event", m.group(4))
            m = re.match(r"\S+ <\d+>1 \S+ (\w+) ([\w-]+) ", line)   # RFC5424 syslog
            if m:
                d.setdefault("service", m.group(1)); d.setdefault("trace_id", m.group(2))
        d = {k: (None if v in ("null", "None") else v) for k, v in d.items()}
        trace = d.get("trace_id") or d.get("requestId") or d.get("function_trace")
        if not trace:
            t = TRACE.search(line)
            trace = t.group(0) if t else None
        rid = d.get("resource_id")
        if not trace:
            if rid and system_of(rid):
                out.append(_obs(ev, rid, dict(d, _line=line.strip()), ts, d.get("system")))
            continue
        # A trace is one lookup: its "started" line carries the lookup key, its
        # "completed" line the result. Merge them into a single observation.
        t = traces.setdefault(trace, {"attrs": {}, "rids": [], "ts": ts, "lines": []})
        for k, v in d.items():
            if v is not None or k not in t["attrs"]:
                t["attrs"][k] = v
        t["lines"].append(line.strip())
        t["ts"] = ts or t["ts"]
        if rid and system_of(rid) and rid not in t["rids"]:
            t["rids"].append(rid)
    for t in traces.values():
        for rid in t["rids"]:
            attrs = dict(t["attrs"], resource_id=rid, _line="\n".join(t["lines"]))
            out.append(_obs(ev, rid, attrs, t["ts"], attrs.get("system") or attrs.get("service") or attrs.get("function")))
    return out


def parse_handover(path, ev):
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        parts = [p.strip() for p in line.lstrip("- ").split("|")]
        if len(parts) == 6 and system_of(parts[2]):
            ts, sysname, rid, rtype, result, ref = parts
            out.append(_obs(ev, rid, {"record_type": rtype, "result": result, "subject_reference": ref}, ts, sysname))
    return out


def parse_pdf(path, ev):
    from pypdf import PdfReader
    text = "\n".join(p.extract_text() or "" for p in PdfReader(path).pages)
    out = []
    flat = " ".join(text.split())
    for rid in sorted(set(m.group(0) for m in RID.finditer(flat))):
        out.append(_obs(ev, rid, {"_text": flat, "document": Path(path).name}))
    # register rows referencing users (e.g. legal hold registers)
    for m in re.finditer(r"(ORD-\d+) \| (user_\d+) \| ([^|]+) \| [^|]+ \| [^|]+ \| Retain until ([^|]+) \|", flat):
        out.append(_obs(ev, "legal_hold_" + m.group(1)[4:], {"order": m.group(1), "subject_reference": m.group(2),
                        "reason": m.group(3).strip(), "retain_until": m.group(4).strip(), "record_type": "LEGAL_HOLD_RECORD"},
                        None, "legal_service"))
    return out, flat


def load_all(dataset_dir, image_reader=None):
    """Return (observations, documents_text) for every evidence file."""
    dataset_dir = Path(dataset_dir)
    obs, texts = [], {}
    for ev in csv.DictReader(open(dataset_dir / "evidence_files.csv", encoding="utf-8")):
        p = dataset_dir / ev["file_path"]
        suffix = p.suffix.lower()
        if suffix == ".json":
            obs += parse_json(p, ev)
        elif suffix == ".sql":
            obs += parse_sql(p, ev)
        elif suffix == ".log":
            obs += parse_log(p, ev)
        elif suffix == ".txt":
            obs += parse_handover(p, ev)
        elif suffix == ".pdf":
            o, t = parse_pdf(p, ev)
            obs += o
            texts[ev["file_id"]] = t
        elif suffix in (".png", ".jpg", ".jpeg") and image_reader:
            o, t = image_reader(p, ev)
            obs += o
            texts[ev["file_id"]] = t
    return obs, texts
