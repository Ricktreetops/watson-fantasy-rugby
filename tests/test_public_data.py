import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = json.loads((ROOT / "data" / "public.json").read_text())
DEMO = json.loads((ROOT / "data" / "demo-seed.json").read_text())
PICKS = json.loads((ROOT / "picks.json").read_text())

FORBIDDEN = set(PICKS["fantasy_teams"]["Cameron"]["R4"]["slots"].values())


class PublicDataTest(unittest.TestCase):
    def test_no_private_material(self):
        blob = json.dumps(PUBLIC) + json.dumps(DEMO)
        for banned in ("fantasy_teams", "_private", "picks_collection", "password", "@"):
            self.assertNotIn(banned, blob)

    def test_squad_shape(self):
        self.assertEqual(PUBLIC["managers"], ["Richard", "Sharon", "Brooke", "Cameron"])
        self.assertEqual(PUBLIC["admin"], "Richard")
        self.assertEqual(PUBLIC["rules"]["max_per_nation"], 3)
        self.assertEqual(len(PUBLIC["squad"]), 387)
        self.assertEqual(len(PUBLIC["fixtures"]), 24)
        rsa = next(u for u in PUBLIC["unions"] if u["code"] == "RSA")
        self.assertEqual(rsa["status"], "TBC")
        self.assertFalse(any(p["union_code"] == "RSA" for p in PUBLIC["squad"]))
        self.assertEqual(PUBLIC["rounds"][0]["lock_at"], "2026-11-06T20:10:00Z")

    def test_sample_teams_are_not_the_saved_test_pick(self):
        self.assertNotIn("Richard", DEMO["teams"])
        for name, team in DEMO["teams"].items():
            self.assertNotEqual(set(team["slots"].values()), FORBIDDEN, name)
            self.assertEqual(len(team["slots"]), 15)
            self.assertIn(team["captain"], team["slots"].values())
            self.assertNotIn(team["supersub"], team["slots"].values())


if __name__ == "__main__":
    unittest.main()
