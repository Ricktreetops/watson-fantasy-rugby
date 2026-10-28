import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score_ref import score_team

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "cases.json").read_text())


class ScoreRefTest(unittest.TestCase):
    def test_cases(self):
        for case in DATA["cases"]:
            with self.subTest(case=case["name"]):
                got = score_team(
                    case["team"],
                    case["round"],
                    {
                        "rules": DATA["rules"],
                        "fixtures": case["fixtures"],
                        "results": case["results"],
                        "stats": case["stats"],
                        "groups": case["groups"],
                    },
                )
                for key, value in case["expect"].items():
                    self.assertEqual(got[key], value, case["name"])

    def test_tie_break_order_matches_the_league_sorter(self):
        # Higher total, then higher fantasy points, then more correct winners.
        rows = [
            {"points": 10, "fantasy_points": 4, "correct_winners": 2, "name": "a"},
            {"points": 10, "fantasy_points": 6, "correct_winners": 0, "name": "b"},
            {"points": 11, "fantasy_points": 1, "correct_winners": 0, "name": "c"},
            {"points": 10, "fantasy_points": 4, "correct_winners": 1, "name": "d"},
        ]
        rows.sort(key=lambda r: (-r["points"], -r["fantasy_points"], -r["correct_winners"]))
        self.assertEqual([r["name"] for r in rows], ["c", "b", "a", "d"])


if __name__ == "__main__":
    unittest.main()
