"""The only AI-dependent steps, both cached so each input is sent to the model at most once:

  * read_image    - screenshots are the one evidence type code cannot parse; Claude vision
                    extracts the resource ids, identifiers and state shown on screen.
  * explain_case  - optional plain-language summary of a finished audit for the dashboard.

Without ANTHROPIC_API_KEY the pipeline still runs: cached image reads are used and uncached
screenshots are reported as unread instead of being guessed.
"""
import base64
import hashlib
import json
import os
from pathlib import Path

CACHE = Path(__file__).resolve().parent.parent / "ai_cache.json"
MODEL = os.environ.get("AUDIT_MODEL", "claude-sonnet-5-5")

IMAGE_PROMPT = """You are reading a screenshot used as evidence in a personal-data deletion audit.
Return ONLY JSON: {"records": [{"resource_id": "...", "system": "...", "present": true|false,
"identifiers": {"user_id": null, "email": null, "phone": null, "name": null},
"restore_allowed": null, "enabled": null, "redacted": null}], "summary": "one sentence"}
Include every resource id visible (account_N, search_N, analytics_N, support_N, export_N, data_flow_N,
backup_N, audit_record_N, tombstone_N, marketing_N, object_N, user_N). Use null when not shown."""


def _load():
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(cache):
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True), encoding="utf-8")


def _client():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    import anthropic
    return anthropic.Anthropic()


def read_image(path, ev):
    """Parser hook for screenshots: returns (observations, text)."""
    raw = Path(path).read_bytes()
    key = "img:" + hashlib.sha256(raw).hexdigest()
    cache = _load()
    if key not in cache:
        client = _client()
        if client is None:
            return [], f"[unread screenshot {Path(path).name}: set ANTHROPIC_API_KEY to extract]"
        msg = client.messages.create(model=MODEL, max_tokens=1500, messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(raw).decode()}},
            {"type": "text", "text": IMAGE_PROMPT}]}])
        text = msg.content[0].text
        cache[key] = json.loads(text[text.find("{"):text.rfind("}") + 1])
        cache[key]["file"] = Path(path).name
        _save(cache)
    data = cache[key]
    obs = []
    for r in data.get("records", []):
        attrs = {k: v for k, v in (r.get("identifiers") or {}).items() if v}
        for k in ("restore_allowed", "enabled"):
            if r.get(k) is not None:
                attrs[k] = r[k]
        if r.get("present") is False:
            attrs["result"] = "NOT_FOUND"
        if r.get("redacted"):
            attrs["result"] = "REDACTED"
        attrs["source"] = "ai_vision"
        obs.append({"evidence_id": ev["file_id"], "captured_at": ev["captured_at"], "observed_at": ev["captured_at"],
                    "resource_id": r["resource_id"], "system": r.get("system"), "attrs": attrs})
    return obs, data.get("summary", "")


def explain_case(result):
    """One-paragraph explanation of an audit result (cached by its content)."""
    payload = json.dumps({"status": result["deletion_status"], "steps": result["steps"],
                          "request": result["request"].get("request_text", "")}, sort_keys=True)
    key = "explain:" + hashlib.sha256(payload.encode()).hexdigest()
    cache = _load()
    if key in cache:
        return cache[key]
    client = _client()
    if client is None:
        return None
    msg = client.messages.create(model=MODEL, max_tokens=400, messages=[{"role": "user", "content":
        "Explain this deletion-audit result to a privacy officer in 3 sentences: what remains, why it matters, "
        "what the steps do. Do not invent facts.\n" + payload}])
    cache[key] = msg.content[0].text.strip()
    _save(cache)
    return cache[key]
