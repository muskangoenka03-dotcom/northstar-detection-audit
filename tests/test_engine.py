"""Decision layer: observation state rules, and end-to-end scores on the labelled samples."""
import unittest

from helpers import DATASET

from audit.engine import obs_state


def obs(system, **attrs):
    return {"system": system, "attrs": attrs}


class ObservationState(unittest.TestCase):
    def test_not_found_lookup_means_absent(self):
        present, _, _ = obs_state(obs("search_service", http_status="404"))
        self.assertFalse(present)

    def test_email_in_record_is_identifiable(self):
        _, identifiable, _ = obs_state(obs("support_platform", email="a.new@example.com"))
        self.assertTrue(identifiable)

    def test_redacted_record_is_not_identifiable(self):
        _, identifiable, _ = obs_state(obs("support_platform", result="redacted"))
        self.assertFalse(identifiable)

    def test_enabled_sync_is_active_and_disabled_is_not(self):
        self.assertTrue(obs_state(obs("integration_service", enabled="true"))[2])
        self.assertFalse(obs_state(obs("integration_service", result="disabled"))[2])

    def test_blocked_backup_cannot_restore(self):
        self.assertFalse(obs_state(obs("backup_service", eligible="true", deletion_block="true"))[2])


@unittest.skipUnless((DATASET / "sample_output.csv").exists(), "dataset/ not present (it is not committed)")
class SampleScores(unittest.TestCase):
    def test_scores_do_not_regress(self):
        from evaluate import evaluate
        s = evaluate()
        self.assertEqual(s["status_accuracy"], 1.0)
        self.assertGreaterEqual(round(s["exact_match"] * s["cases"]), 30)


if __name__ == "__main__":
    unittest.main()
