"""Run: python3 -m unittest discover -s tests   (uses a temp copy of the DB)"""
import os, shutil, sys, tempfile, unittest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_tmp = tempfile.mkdtemp()
os.environ["SUKI_DB"] = os.path.join(_tmp, "store.db")
shutil.copy(os.path.join(ROOT, "data", "store.db"), os.environ["SUKI_DB"])
sys.path.insert(0, os.path.join(ROOT, "mcp-server"))
import suki_core as core  # noqa: E402


class Reads(unittest.TestCase):
    def test_scorecard_covers_all_branches_at_sandbox_now(self):
        s = core.branch_scorecard()
        self.assertEqual(len(s["branches"]), 12)
        self.assertEqual(s["as_of"], "2026-09-30 21:00:00")
        self.assertEqual(sum(b["stockout_risks"] for b in s["branches"]), 67)
        self.assertIsNone(next(b for b in s["branches"] if b["code"] == "ERM")["on_time_pct"])

    def test_as_of_changes_window(self):
        a = core.branch_scorecard(30)["branches"][0]["open_tickets"]
        b = core.branch_scorecard(30, "2026-06-30")["branches"][0]["open_tickets"]
        self.assertNotEqual(a, b)

    def test_bad_as_of_rejected(self):
        with self.assertRaises(ValueError):
            core.branch_scorecard(30, "not-a-date")

    def test_lists_are_bounded_and_filtered(self):
        rows = core.list_open_tickets("tmr", limit=500)
        self.assertLessEqual(len(rows), 50)
        self.assertTrue(all(r["branch"] == "TMR" for r in rows))
        self.assertEqual(core.list_supplier_slips()[0]["supplier"], "Visayas Canning Corp.")


class Writes(unittest.TestCase):
    def test_escalate_logs_and_is_idempotent(self):
        t = next(r for r in core.list_open_tickets(limit=50) if r["priority"] != "urgent")
        self.assertTrue(core.escalate_ticket(t["ticket_number"], "test")["changed"])
        self.assertFalse(core.escalate_ticket(t["ticket_number"], "again")["changed"])
        self.assertEqual(core.list_actions()[0]["action"], "escalate_ticket")

    def test_draft_never_publishes(self):
        r = core.list_unreplied_bad_reviews(limit=1)[0]
        core.draft_review_reply(r["review_id"], "Sorry about that.")
        still = core.query("SELECT replied_at FROM reviews WHERE id=?", (r["review_id"],))[0]
        self.assertIsNone(still["replied_at"])

    def test_invalid_targets_rejected(self):
        with self.assertRaises(ValueError):
            core.escalate_ticket("TKT-NOPE", "x")
        with self.assertRaises(ValueError):
            core.draft_review_reply(1, "  ")


if __name__ == "__main__":
    unittest.main()
