"""Deterministic deletion-audit engine.

For each deletion request:
  1. resolve the subject's current and historical identifiers
  2. link every resource that any evidence or activity ties to those identifiers
  3. take each resource's latest observed state at audit time
  4. compare that state with the policy treatment and emit ordered steps
"""
import csv
import re
from collections import defaultdict
from pathlib import Path

from .graph import IdentityGraph
from .parsers import load_all, system_of

SYSTEM_ORDER = ["account_service", "export_service", "search_service", "cache_service", "marketing_platform",
                "object_storage", "analytics_platform", "support_platform", "email_delivery_service",
                "identity_service", "security_service", "legal_service", "integration_service", "backup_service"]
VERIFY_ORDER = ["ABSENT", "PRESENT", "REDACTED", "ANONYMIZED", "DISABLED", "BLOCKED"]
REMEDIATION_ORDER = ["DISABLE_DATA_FLOW", "BLOCK_RESTORE", "DELETE_RECORD", "REDACT_RECORD", "ANONYMIZE_RECORD"]
VERIFY_OP = {"ABSENT": "VERIFY_RECORD_ABSENT", "PRESENT": "VERIFY_RECORD_PRESENT", "REDACTED": "VERIFY_RECORD_REDACTED",
             "ANONYMIZED": "VERIFY_RECORD_ANONYMIZED", "DISABLED": "VERIFY_DATA_FLOW_DISABLED", "BLOCKED": "VERIFY_RESTORE_BLOCKED"}
TARGET_STATE = {"DELETE_RECORD": "ABSENT", "REDACT_RECORD": "REDACTED", "ANONYMIZE_RECORD": "ANONYMIZED",
                "DISABLE_DATA_FLOW": "DISABLED", "BLOCK_RESTORE": "BLOCKED"}
FINDING_OP = {"DELETE_RECORD": "REPORT_REMAINING_RECORD", "REDACT_RECORD": "REPORT_EXPOSED_PII",
              "ANONYMIZE_RECORD": "REPORT_EXPOSED_PII", "DISABLE_DATA_FLOW": "REPORT_ACTIVE_DATA_FLOW",
              "BLOCK_RESTORE": "REPORT_RESTORE_RISK"}
FINDING_STATE = {"DISABLE_DATA_FLOW": "ACTIVE", "BLOCK_RESTORE": "ACTIVE"}
DEFAULT_ACTION = {"analytics_platform": "ANONYMIZE_RECORD", "support_platform": "REDACT_RECORD",
                  "identity_service": "REDACT_RECORD", "email_delivery_service": "REDACT_RECORD",
                  "integration_service": "DISABLE_DATA_FLOW", "backup_service": "BLOCK_RESTORE"}
RETAINED = {"security_service", "legal_service"}
PII_FIELDS = {"email", "phone", "email_hash", "full_name", "name", "display_name", "requester_name", "requester_email",
              "requester_phone", "owner_email", "owner_phone", "customer_email", "matched_value", "subject_selector"}
NULLISH = {None, "", "null", "none", "[redacted]", "redacted"}
ABSENT_WORDS = {"not_found", "miss", "absent", "deleted", "0"}


def norm(v):
    return str(v).strip().lower() if v is not None else None


def digits(v):
    d = re.sub(r"\D", "", str(v or ""))
    return d if len(d) >= 7 else None


def truthy(v):
    return norm(v) in {"true", "1", "yes", "active", "enabled"}


# ------------------------------------------------------------------ identities
class Identities:
    def __init__(self, ds):
        self.users = {}
        for r in csv.DictReader(open(ds / "user_identities.csv", encoding="utf-8")):
            self.users[r["user_id"]] = {"user_id": r["user_id"], "name": r["name"], "current": r,
                                        "emails": {norm(r["email"])}, "phones": {digits(r["phone"])} - {None},
                                        "hashes": {norm(r["email_hash"])}, "history": []}
        for r in csv.DictReader(open(ds / "user_audit_log.csv", encoding="utf-8")):
            u = self.users.setdefault(r["user_id"], {"user_id": r["user_id"], "name": None, "current": {},
                                                     "emails": set(), "phones": set(), "hashes": set(), "history": []})
            u["history"].append(r)
            for v in (r["old_value"], r["new_value"]):
                if r["field_name"] == "email":
                    u["emails"].add(norm(v))
                elif r["field_name"] == "phone" and digits(v):
                    u["phones"].add(digits(v))
                elif r["field_name"] == "email_hash":
                    u["hashes"].add(norm(v))
        self.by_key = {}
        for u in self.users.values():
            for k in u["emails"] | u["hashes"] | {u["user_id"].lower()}:
                self.by_key.setdefault(k, set()).add(u["user_id"])
            for p in u["phones"]:
                self.by_key.setdefault("tel:" + p, set()).add(u["user_id"])

    def resolve(self, email, at):
        """The user who held `email` at time `at` (emails can be reassigned)."""
        e = norm(email)
        owners = []
        for u in self.users.values():
            if e not in u["emails"]:
                continue
            changes = sorted((h for h in u["history"] if h["field_name"] == "email"), key=lambda h: h["event_time"])
            held = norm(u["current"].get("email")) == e
            for h in changes:          # replay history up to `at`
                if h["event_time"] <= at:
                    held = norm(h["new_value"]) == e
                elif norm(h["old_value"]) == e:
                    held = True
                    break
            owners.append((held, u["user_id"]))
        owners.sort(reverse=True)
        return owners[0][1] if owners else None

    def match(self, value):
        """User ids an arbitrary evidence value points to."""
        if value is None:
            return set()
        s = norm(value)
        hits = set(self.by_key.get(s, ()))
        p = digits(value) if not s.startswith(("user_", "account_")) and "@" not in s and len(s) < 25 else None
        if p:
            hits |= self.by_key.get("tel:" + p, set())
        for e in re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", s):   # emails embedded in free text
            hits |= self.by_key.get(e.rstrip("."), set())
        return hits


# ------------------------------------------------------------------ observation state
def obs_state(o):
    """Interpret one observation: returns (present, identifiable, active) where None = unknown."""
    a = {k.lower(): v for k, v in o["attrs"].items()}
    sysn = o["system"]
    present = True
    for k in ("http_status", "status_code"):
        if a.get(k) is not None and str(a[k]) == "404":
            present = False
    if norm(a.get("rows")) == "0" or norm(a.get("total")) == "0":
        present = False
    if norm(a.get("result")) in ABSENT_WORDS or norm(a.get("account_status")) == "deleted" and sysn == "account_service":
        present = False
    if "profile" in o["attrs"] and o["attrs"].get("profile") is None and not any(a.get(f) for f in PII_FIELDS):
        present = False
    if norm(a.get("marker_found")) == "true":
        present = False
    if norm(a.get("download_available")) == "false" and sysn == "export_service":
        present = False
    identifiable = any(norm(a.get(f)) not in NULLISH for f in PII_FIELDS)
    if norm(a.get("result")) == "identifiable" or (a.get("direct_identifiers") not in (None, "0")):
        identifiable = True
    if norm(a.get("result")) in {"anonymized", "redacted"} or norm(a.get("direct_identifiers")) == "0":
        identifiable = False
    text = a.get("message_text") or a.get("message_excerpt")
    if text and "@" in str(text):
        identifiable = True
    if sysn == "analytics_platform" and (norm(a.get("customer_reference")) not in NULLISH or norm(a.get("user_id")) not in NULLISH):
        identifiable = True
    if sysn == "analytics_platform" and a.get("correlation_key") and norm(a.get("event", "")).startswith("contact"):
        identifiable = True
    active = None
    if sysn == "integration_service":
        active = truthy(a.get("enabled")) or norm(a.get("result")) == "active"
        if norm(a.get("result")) == "disabled" or norm(a.get("last_delivery_status")) == "stopped" and not truthy(a.get("enabled")):
            active = False
    if sysn == "backup_service":
        active = (truthy(a.get("restore_allowed")) or norm(a.get("result")) == "active"
                  or (truthy(a.get("eligible")) and norm(a.get("deletion_block")) != "true"))
        if norm(a.get("result")) == "blocked" or norm(a.get("deletion_block")) == "true":
            active = False
    return present, identifiable, active


def _ts(s):
    from datetime import datetime
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def is_attachment(o):
    a = o["attrs"]
    return bool(a.get("file") or "attachment" in str(a.get("event", "")) or "attachment" in str(a.get("document", ""))
                or norm(a.get("record_type")) == "support_attachment")


# ------------------------------------------------------------------ engine
class Auditor:
    def __init__(self, dataset_dir, image_reader=None):
        self.ds = Path(dataset_dir)
        self.ids = Identities(self.ds)
        self.rules = list(csv.DictReader(open(self.ds / "deletion_rules.csv", encoding="utf-8")))
        self.evidence = {r["file_id"]: r for r in csv.DictReader(open(self.ds / "evidence_files.csv", encoding="utf-8"))}
        self.activity = list(csv.DictReader(open(self.ds / "system_activity.csv", encoding="utf-8")))
        obs, self.texts = load_all(self.ds, image_reader)
        self.scopes = [o for o in obs if o.get("scope")]
        self.obs = [o for o in obs if not o.get("scope") and o["resource_id"]]
        self.by_resource = defaultdict(list)
        for o in self.obs:
            self.by_resource[o["resource_id"]].append(o)
        self.act_by_resource = defaultdict(list)
        for a in self.activity:
            self.act_by_resource[a["resource_id"]].append(a)
            for rid in re.findall(r"\b[a-z_]+_\d+\b", a["details"]):
                if rid != a["resource_id"] and system_of(rid):
                    self.act_by_resource[rid].append(a)
        self._link_index()

    # every resource -> users it is tied to, through any evidence at any time
    def _link_index(self):
        self.graph = IdentityGraph(self.ids)
        self.res_users = defaultdict(set)
        self.res_links = defaultdict(list)     # resource -> [(user, evidence_id, field)]
        for o in self.obs:
            for k, v in o["attrs"].items():
                if k.startswith("_") or v is None:
                    continue
                self.graph.link_observation(o, k, v)
                for u in self.ids.match(v):
                    self.res_users[o["resource_id"]].add(u)
                    self.res_links[o["resource_id"]].append((u, o["evidence_id"], k))
        for eid, text in self.texts.items():
            for rid in {m for m in re.findall(r"\b[a-z_]+_\d+\b", text) if system_of(m)}:
                for u in self.ids.match(text) | {x for t in re.findall(r"user_\d+", text) for x in self.ids.match(t)}:
                    if len(self.ids.match(text)) <= 1:
                        self.res_users[rid].add(u)
                        self.res_links[rid].append((u, eid, "document"))
                        self.graph.add(f"res:{rid}", f"user:{u}", "document", eid)
        for a in self.activity:
            # a sync or restore that "repopulated downstream resource X" makes X part of the same footprint
            for rid in re.findall(r"repopulated downstream resource (\w+)", a["details"]):
                self.graph.add(f"res:{a['resource_id']}", f"res:{rid}", "repopulated", a["activity_id"])
            if a["event_type"] == "LINK_RESOURCE_IDENTITY":
                for u in self.ids.match(a["details"]) | {x for t in re.findall(r"user_\d+", a["details"]) for x in self.ids.match(t)}:
                    self.res_users[a["resource_id"]].add(u)
                    self.res_links[a["resource_id"]].append((u, a["activity_id"], "data_catalog"))
                    self.graph.add(f"res:{a['resource_id']}", f"user:{u}", "data_catalog", a["activity_id"])
                # the catalog also names how the resource appears elsewhere (statement number, file name):
                # any evidence containing that alias is a sighting of the resource
                m = re.search(r"\(([^)]+)\)", a["details"])
                alias = m.group(1) if m else None
                if alias and alias != a["resource_id"] and not alias.startswith("user_"):
                    self._alias_sightings(a["resource_id"], alias)

    def _alias_sightings(self, rid, alias):
        for eid, text in self.texts.items():
            if alias in text:
                ev = self.evidence[eid]
                o = {"evidence_id": eid, "captured_at": ev["captured_at"], "observed_at": ev["captured_at"],
                     "resource_id": rid, "system": system_of(rid), "attrs": {"alias": alias, "document": ev["file_path"],
                                                                            "result": "FOUND"}}
                self.obs.append(o)
                self.by_resource[rid].append(o)

    def requests(self, name="deletion_requests.csv"):
        return list(csv.DictReader(open(self.ds / name, encoding="utf-8")))

    # ---------------------------------------------------------------- orphan accounts
    def match_orphans(self, requests):
        """Some account deletes carry no identifier anywhere in the evidence. The deletion worker
        submits a request's account 0-80 min before the request is reported, with a result that
        matches the reported status, so pair these one-to-one (tightest candidates first).
        Links made this way are marked 'inferred' in the output."""
        self.inferred = {}
        dels = [a for a in self.activity if a["target_system"] == "account_service" and a["event_type"] == "DELETE_RECORD"
                and a["source_system"] == "deletion_worker" and not self.res_users.get(a["resource_id"])]
        compatible = {"COMPLETE": {"SUCCESS"}, "NOT_STARTED": {"FAILED"}, "FAILED": {"FAILED"},
                      "PARTIALLY_COMPLETE": {"PARTIAL"}, "PARTIAL": {"PARTIAL"}}
        cands = {}
        for r in requests:
            uid = self.ids.resolve(r["email"], r["requested_at"])
            if any(system_of(x) == "account_service" for x, us in self.res_users.items() if uid in us):
                continue
            rep = _ts(r["reported_at"])
            scored = []
            for a in dels:
                gap = (_ts(a["event_time"]) - rep) / 60
                if -80 <= gap <= 10:
                    ok = a["reported_result"] in compatible.get(r["reported_status"], {a["reported_result"]})
                    scored.append((0 if ok else 1, abs(gap + 55), a["resource_id"]))
            cands[r["case_id"]] = (uid, sorted(scored))
        # Requests reported in the same batch: the worker processes the oldest request last,
        # so pair batch members by requested_at (newest first) with deletes in time order.
        by_id = {r["case_id"]: r for r in requests}
        batches = defaultdict(list)
        for cid in cands:
            batches[(by_id[cid]["reported_at"], by_id[cid]["reported_status"])].append(cid)
        taken = set()
        for (rep, status), cids in sorted(batches.items()):
            ok = compatible.get(status)
            pool = sorted({rid for cid in cids for good, _, rid in cands[cid][1] if good == 0},
                          key=lambda rid: self.act_by_resource[rid][0]["event_time"])
            pool = [p for p in pool if p not in taken]
            for cid in sorted(cids, key=lambda c: by_id[c]["requested_at"], reverse=True):
                mine = {rid for g, _, rid in cands[cid][1] if g == 0}
                pick = next((p for p in pool if p in mine and p not in taken), None)
                if pick:
                    taken.add(pick)
                    self.inferred[cid] = pick
        for cid, (uid, sc) in sorted(cands.items(), key=lambda kv: len(kv[1][1])):
            if cid not in self.inferred:
                pick = next((rid for _, _, rid in sc if rid not in taken), None)
                if pick:
                    taken.add(pick)
                    self.inferred[cid] = pick
        self.assign_policy_orphans(requests)
        # a successful policy action leaves the record compliant, and an incomplete audit only
        # verifies what it remediates, so those records belong to requests that prove completion
        status = {r["case_id"]: self.audit(r)["deletion_status"] for r in requests}
        self.assign_policy_orphans(requests, status)

    def assign_policy_orphans(self, requests, status=None):
        """Policy actions on records that carry no identifier (e.g. already-anonymised analytics)
        follow the account delete within ~35 minutes of the report. Give each to the request whose
        own records share evidence files with it (then complete requests, then case order)."""
        self.inferred_extra = defaultdict(list)
        acc_of = {}
        for r in requests:
            uid = self.ids.resolve(r["email"], r["requested_at"])
            linked = [x for x, us in self.res_users.items() if uid in us and system_of(x) == "account_service"]
            acc = self.inferred.get(r["case_id"]) or (linked[0] if linked else None)
            t = min((a["event_time"] for a in self.act_by_resource.get(acc, []) if a["target_system"] == "account_service"),
                    default=None) if acc else None
            acc_of[r["case_id"]] = (t or (r["requested_at"] if uid else None), uid)
        # evidence files where each request's own records were seen
        ev_of = {}
        for cid, (t, uid) in acc_of.items():
            own = [x for x, us in self.res_users.items() if uid in us] + ([self.inferred[cid]] if cid in self.inferred else [])
            ev_of[cid] = {o["evidence_id"] for x in own for o in self.by_resource.get(x, [])}
        case_no = lambda cid: int(cid.split("_")[1])
        policy = sorted((a for a in self.activity if a["source_system"] == "deletion_worker"
                         and a["target_system"] not in ("account_service", "legal_service")
                         and not self.res_users.get(a["resource_id"])), key=lambda a: a["event_time"])
        for a in policy:
            sysn = system_of(a["resource_id"])
            orphan_ev = {o["evidence_id"] for o in self.by_resource.get(a["resource_id"], [])}
            cands2 = []
            for r in requests:
                gap = (_ts(r["reported_at"]) - _ts(a["event_time"])) / 60
                t, uid = acc_of[r["case_id"]]
                has = any(system_of(x) == sysn for x, us in self.res_users.items() if uid in us) or \
                    any(system_of(x) == sysn for x in self.inferred_extra[r["case_id"]])
                if 0 <= gap <= 35 and t and t <= a["event_time"] and not has:
                    # prefer the request whose records share evidence files with this one, then case order
                    done = (status or {}).get(r["case_id"]) == "COMPLETE" or a["reported_result"] != "SUCCESS"
                    cands2.append((-len(orphan_ev & ev_of[r["case_id"]]), not done, case_no(r["case_id"]), r["case_id"]))
            if cands2:
                self.inferred_extra[min(cands2)[-1]].append(a["resource_id"])

    # ---------------------------------------------------------------- per case
    def audit(self, req):
        uid = self.ids.resolve(req["email"], req["requested_at"])
        user = self.ids.users.get(uid, {})
        paths = self.graph.footprint(uid) if uid else {}
        resources = set(paths)
        accounts = [r for r in resources if system_of(r) == "account_service"]
        inferred = getattr(self, "inferred", {}).get(req["case_id"])
        if len(accounts) > 1:   # several historical accounts: keep the one this request's job acted on
            near = [r for r in accounts if any(abs(_ts(a["event_time"]) - _ts(req["reported_at"])) < 6000
                                                for a in self.act_by_resource.get(r, []))]
            resources -= set(accounts) - set(near or accounts)
        if not accounts and inferred:
            resources.add(inferred)
        elif not accounts and uid:
            resources.add("account_%03d" % int(uid.split("_")[1]))
        extra = set(getattr(self, "inferred_extra", {}).get(req["case_id"], []))
        resources |= extra
        items = [self._assess(rid, req) for rid in sorted(resources)]
        # compliant records seen only before the request add nothing to the proof
        items = [i for i in items if i and not (i["ok"] and i["system"] not in ("account_service", "security_service")
                                                and i["obs"] and i["obs"]["observed_at"] < req["requested_at"])]
        for i in items:
            i["inferred"] = (i["rid"] == inferred and not accounts) or i["rid"] in extra
            i["path"] = [{"node": n, "via": k, "source": s} for n, k, s in paths.get(i["rid"], [])]
        result = self._steps(req, uid, user, items)
        result["graph"] = self._case_graph(uid, items)
        return result

    def _case_graph(self, uid, items):
        if not uid:
            return {"nodes": [], "edges": []}
        g = self.graph.subgraph(uid, [i["rid"] for i in items])
        status = {f"res:{i['rid']}": ("ok" if i["ok"] else "open", i["state"], i["inferred"]) for i in items}
        for n in g["nodes"]:
            if n["id"] in status:
                n["status"], n["target"], n["inferred"] = status[n["id"]]
        have = {(e["source"], e["target"]) for e in g["edges"]} | {(e["target"], e["source"]) for e in g["edges"]}
        for i in items:                      # activity-inferred links have no evidence edge: draw them dashed
            if i["inferred"] and (f"user:{uid}", f"res:{i['rid']}") not in have:
                g["edges"].append({"source": f"user:{uid}", "target": f"res:{i['rid']}", "kind": "inferred", "evidence": None})
        return g

    def _assess(self, rid, req):
        sysn = system_of(rid)
        audit_at = req["audit_at"]
        if sysn == "legal_service":     # legal holds are retained by policy; reported, never actioned
            return None
        allseen = sorted(self.by_resource.get(rid, []), key=lambda o: (o["observed_at"] or "", o["captured_at"]))
        seen = [o for o in allseen if o["captured_at"] <= audit_at]
        acts = sorted((a for a in self.act_by_resource.get(rid, []) if a["event_time"] <= audit_at), key=lambda a: a["event_time"])
        intended = next((a["event_type"] for a in reversed(acts) if a["source_system"] == "deletion_worker"
                         and a["event_type"] in TARGET_STATE), None)
        last = seen[-1] if seen else None
        if sysn in RETAINED:
            # retained records stay whatever the snapshot timing; only an expired retention changes that
            ref = last or (allseen[-1] if allseen else None)
            retain_until = ref and (ref["attrs"].get("retention_until") or ref["attrs"].get("retain_until"))
            if retain_until and retain_until[:4].isdigit() and retain_until < audit_at:
                return self._item(rid, sysn, "DELETE_RECORD", not obs_state(ref)[0], ref, acts)
            return {"rid": rid, "system": sysn, "state": "PRESENT", "ok": True, "action": "RETAIN",
                    "evidence": ref["evidence_id"] if ref else None, "obs": ref, "acts": acts}
        if last is None:
            # no direct sighting before the audit: prove absence from the latest snapshot covering that store
            if sysn != "account_service":
                return None
            return {"rid": rid, "system": sysn, "state": "ABSENT", "ok": True, "action": "DELETE_RECORD",
                    "evidence": self._scope_evidence(sysn, audit_at), "obs": None, "acts": acts}
        present, identifiable, active = obs_state(last)
        # resurrection: a sync or restore repopulated the resource after the evidence last showed it
        revived = [a for a in self.act_by_resource.get(rid, []) if "repopulated" in a["details"]
                   and a["resource_id"] != rid and last["observed_at"] < a["event_time"] <= audit_at]
        if revived and not present:
            present, identifiable = True, True
        if sysn in ("integration_service", "backup_service"):
            action = DEFAULT_ACTION[sysn]
            return self._item(rid, sysn, action, present is False or active is False, last, acts)
        action = DEFAULT_ACTION.get(sysn, "DELETE_RECORD")
        if intended in ("DELETE_RECORD", "REDACT_RECORD", "ANONYMIZE_RECORD") and sysn not in ("identity_service",):
            action = intended
        if sysn == "support_platform" and is_attachment(last):
            action = "DELETE_RECORD"
        if action == "DELETE_RECORD":
            return self._item(rid, sysn, action, not present, last, acts)
        return self._item(rid, sysn, action, not present or not identifiable, last, acts)

    def _item(self, rid, sysn, action, ok, last, acts):
        return {"rid": rid, "system": sysn, "state": TARGET_STATE[action], "ok": ok, "action": action,
                "evidence": last["evidence_id"] if last else None, "obs": last, "acts": acts}

    def _scope_evidence(self, sysn, audit_at):
        """Latest full snapshot of the store taken before the audit. Inventory captures only hold
        their own batch of customers, so they prove absence only when nothing broader exists."""
        best = None
        for s in self.scopes:
            if s["system"] == sysn and s["captured_at"] <= audit_at:
                key = ("inventory" not in self.evidence[s["evidence_id"]]["origin"], s["captured_at"])
                if best is None or key > best[0]:
                    best = (key, s)
        return best[1]["evidence_id"] if best else None

    def _steps(self, req, uid, user, items):
        rank = lambda i: SYSTEM_ORDER.index(i["system"]) if i["system"] in SYSTEM_ORDER else 99
        bad = sorted((i for i in items if not i["ok"]), key=rank)
        steps = []

        def add(phase, i, op, state, ev):
            steps.append({"step_no": len(steps) + 1, "phase": phase, "system_id": i["system"], "resource_id": i["rid"],
                          "operation": op, "state": state, "evidence_id": ev or ""})

        for i in bad:
            add("FINDING", i, FINDING_OP[i["action"]], FINDING_STATE.get(i["action"], "PRESENT"), i["evidence"])
        for i in sorted(bad, key=lambda i: (REMEDIATION_ORDER.index(i["action"]), rank(i))):
            add("REMEDIATION", i, i["action"], TARGET_STATE[i["action"]], "")
        complete = not bad
        # an incomplete audit verifies the account, retained records and what it remediates;
        # a complete one proves every linked record
        scope = items if complete else [i for i in items if not i["ok"] or i["system"] == "account_service" or i["state"] == "PRESENT"]
        verify = sorted(scope, key=lambda i: (VERIFY_ORDER.index(i["state"]), i["system"] != "account_service", rank(i)))
        for i in verify:
            add("VERIFICATION", i, VERIFY_OP[i["state"]], i["state"], i["evidence"] if complete else "")
        return {"case_id": req["case_id"], "user_id": uid, "deletion_status": "COMPLETE" if complete else "INCOMPLETE",
                "steps": steps, "items": items, "request": req, "user": user}
