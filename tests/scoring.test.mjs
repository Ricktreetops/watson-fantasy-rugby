import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { scoreTeam, seasonBoard } from "../js/score.js";

const data = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url)));

for (const spec of data.cases) {
  test(spec.name, () => {
    const scored = scoreTeam(spec.team, spec.round, {
      rules: data.rules,
      fixtures: spec.fixtures,
      resultsById: spec.results,
      statsByFixture: spec.stats,
      groupOf: (id) => spec.groups[id] || "",
    });
    assert.equal(scored.fantasyPoints, spec.expect.fantasy);
    assert.equal(scored.predictionPoints, spec.expect.prediction);
    assert.equal(scored.total, spec.expect.total);
    assert.equal(scored.correctWinners, spec.expect.correctWinners);
  });
}

test("season order uses total, then fantasy points, then correct winners", () => {
  const rules = data.rules;
  const fixtures = [{ id: "M1", round_id: "R4", home: "Ireland", away: "Argentina" }];
  const ctx = {
    rules,
    fixtures,
    resultsById: { M1: { home: 20, away: 13 } },
    statsByFixture: {
      M1: {
        "IRE:A": { tries: 1 },
        "IRE:B": { tackles: 4 },
      },
    },
    groupOf: () => "HK",
  };
  const board = seasonBoard(
    [
      { name: "Low", teams: { R4: { slots: { 2: "IRE:B" }, predictions: { M1: { winner: "Ireland", margin: 7 } } } } },
      { name: "High", teams: { R4: { slots: { 2: "IRE:A" }, captain: "IRE:A" } } },
    ],
    ctx
  );
  assert.equal(board[0].name, "High");
  assert.ok(board[0].points > board[1].points);
});
