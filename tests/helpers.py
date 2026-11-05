"""Shared test setup: puts code/ on the import path and builds a tiny synthetic identity dataset."""
import csv
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATASET = REPO / "dataset"
sys.path.insert(0, str(REPO / "code"))
sys.path.insert(0, str(REPO / "evaluation"))

EV = {"file_id": "evidence_t1", "captured_at": "2026-03-15T08:30:00Z"}


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def identity_dataset():
    """user_01 moved from a.old@ to a.new@ in Aug 2025; a.old@ was later given to user_02."""
    d = Path(tempfile.mkdtemp(prefix="audit_test_"))
    write_csv(d / "user_identities.csv", ["user_id", "name", "email", "phone", "email_hash", "updated_at"], [
        ["user_01", "Customer A", "a.new@example.com", "+44 7700 900117", "hash_a", "2025-08-01T00:00:00Z"],
        ["user_02", "Customer B", "a.old@example.com", "+44 7700 900442", "hash_b", "2026-01-10T00:00:00Z"],
    ])
    write_csv(d / "user_audit_log.csv", ["user_id", "field_name", "old_value", "new_value", "event_time"], [
        ["user_01", "email", "a.old@example.com", "a.new@example.com", "2025-08-01T00:00:00Z"],
        ["user_02", "email", "b@example.com", "a.old@example.com", "2026-01-10T00:00:00Z"],
    ])
    return d


def write_file(name, text):
    p = Path(tempfile.mkdtemp(prefix="audit_test_")) / name
    p.write_text(text, encoding="utf-8")
    return p
