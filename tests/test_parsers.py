"""Reading layer: every evidence format becomes the same observation shape."""
import json
import unittest

from helpers import EV, write_file

from audit.parsers import parse_handover, parse_json, parse_log, parse_sql, system_of


class SystemOf(unittest.TestCase):
    def test_prefixes_map_to_systems(self):
        self.assertEqual(system_of("search_4410"), "search_service")
        self.assertEqual(system_of("data_flow_12"), "integration_service")
        self.assertEqual(system_of("audit_record_6645"), "security_service")

    def test_unknown_ids_have_no_system(self):
        self.assertIsNone(system_of("order_5531"))
        self.assertIsNone(system_of(None))


class Formats(unittest.TestCase):
    def test_json_export_finds_nested_records(self):
        p = write_file("export.json", json.dumps({"search_service": {"documents": [
            {"resource_id": "search_4410", "email": "a.new@example.com", "observed_at": "2026-03-15T08:30:00Z"}]}}))
        [o] = parse_json(p, EV)
        self.assertEqual((o["resource_id"], o["system"], o["attrs"]["email"]), ("search_4410", "search_service", "a.new@example.com"))
        self.assertEqual(o["evidence_id"], "evidence_t1")

    def test_sql_snapshot_rows_and_declared_scope(self):
        p = write_file("snap.sql", """
            CREATE TABLE tickets (resource_id TEXT, requester_email TEXT, updated_at TEXT);
            INSERT INTO tickets VALUES ('support_8812', 'a.old@example.com', '2026-03-14T09:00:00Z');
            CREATE TABLE snapshot_scope (origin_system TEXT, captured_at TEXT);
            INSERT INTO snapshot_scope VALUES ('support_platform', '2026-03-14T09:00:00Z');""")
        obs = parse_sql(p, EV)
        rows = [o for o in obs if o["resource_id"]]
        scopes = [o for o in obs if o.get("scope")]
        self.assertEqual(rows[0]["attrs"]["requester_email"], "a.old@example.com")
        self.assertEqual([s["system"] for s in scopes], ["support_platform"])

    def test_key_value_log_line(self):
        p = write_file("a.log", "2026-03-03T10:04:12Z level=INFO svc=account_service action=delete_account resource_id=account_017 result=deleted\n")
        [o] = parse_log(p, EV)
        self.assertEqual((o["resource_id"], o["observed_at"], o["attrs"]["result"]), ("account_017", "2026-03-03T10:04:12Z", "deleted"))

    def test_log_trace_lines_merge_into_one_observation(self):
        p = write_file("b.log", "\n".join([
            '{"ts":"2026-06-12T10:04:01Z","trace_id":"tr-9","event":"lookup_started","resource_id":"search_7731"}',
            '{"ts":"2026-06-12T10:04:02Z","trace_id":"tr-9","event":"lookup_completed","result":"not_found"}']))
        [o] = parse_log(p, EV)
        self.assertEqual((o["resource_id"], o["attrs"]["result"]), ("search_7731", "not_found"))

    def test_handover_rows(self):
        p = write_file("handover.txt", "- 2026-06-13T02:00:14Z | integration_service | data_flow_3 | sync | active | user_42\n")
        [o] = parse_handover(p, EV)
        self.assertEqual((o["resource_id"], o["system"], o["attrs"]["result"]), ("data_flow_3", "integration_service", "active"))


if __name__ == "__main__":
    unittest.main()
