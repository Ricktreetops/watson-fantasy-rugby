import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReadTeam, canWriteTeam, isLocked, lineupNotes } from "../js/lock.js";
import { validateTeam } from "../js/validate.js";
import { createDemoStore } from "../js/demo-store.js";

const publicData = JSON.parse(readFileSync(new URL("../data/public.json", import.meta.url)));
const demoSeed = JSON.parse(readFileSync(new URL("../data/demo-seed.json", import.meta.url)));
const picks = JSON.parse(readFileSync(new URL("../picks.json", import.meta.url)));

const byId = Object.fromEntries(publicData.squad.map((p) => [p.id, p]));
const unionName = Object.fromEntries(publicData.unions.map((u) => [u.code, u.name]));
const base = {
  byId,
  unionName,
  rules: publicData.rules,
  fixtures: publicData.fixtures,
  roundId: "R4",
};

test("sample teams obey the position rules and are not the saved test pick", () => {
  const forbidden = new Set(Object.values(picks.fantasy_teams.Cameron.R4.slots));
  for (const [name, team] of Object.entries(demoSeed.teams)) {
    const result = validateTeam(team, base);
    assert.deepEqual(result.errors, [], name);
    assert.equal(new Set(Object.values(team.slots)).size === forbidden.size && [...forbidden].every((id) => team.slots && Object.values(team.slots).includes(id)), false);
  }
});

test("a hooker cannot pack down at loosehead, and four from one nation is too many", () => {
  const bad = validateTeam(
    {
      slots: {
        1: "IRE:Dan Sheehan",
        2: "IRE:Rónan Kelleher",
        3: "IRE:Andrew Porter",
        4: "IRE:Tadhg Beirne",
      },
    },
    base
  );
  assert.ok(bad.errors.some((e) => e.includes("Dan Sheehan")));
  assert.ok(bad.errors.some((e) => e.includes("Ireland")));
});

test("a position-tbc forward can fill a forward slot and the captain must be in the 15", () => {
  const fx = publicData.squad.find((p) => p.position_group === "FX");
  const ok = validateTeam({ slots: { 1: fx.id }, captain: fx.id }, base);
  assert.ok(!ok.errors.some((e) => e.includes("cannot play")));
  const captain = validateTeam({ slots: { 1: fx.id }, captain: "FRA:Antoine Dupont" }, base);
  assert.ok(captain.errors.some((e) => e.includes("captain")));
});

test("round locks at the first kick-off and other teams stay hidden until then", () => {
  const round = { id: "R4", lock_at: "2026-11-06T20:10:00Z" };
  assert.equal(isLocked(round, "2026-11-06T20:09:00Z"), false);
  assert.equal(isLocked(round, "2026-11-06T20:10:00Z"), true);
  assert.equal(canReadTeam("a", "b", round, "2026-11-06T20:09:00Z"), false);
  assert.equal(canReadTeam("a", "a", round, "2026-11-06T20:09:00Z"), true);
  assert.equal(canReadTeam("admin", "b", round, "2026-11-06T20:09:00Z"), false);
  assert.equal(canReadTeam("a", "b", round, "2026-11-06T20:10:00Z"), true);
  assert.equal(canWriteTeam("a", "a", round, "2026-11-06T20:09:00Z"), true);
  assert.equal(canWriteTeam("a", "a", round, "2026-11-06T20:10:00Z"), false);
  assert.equal(canWriteTeam("a", "b", round, "2026-11-06T20:09:00Z"), false);
});

test("preview hides other teams until the made-up lock, then scores them", async () => {
  const store = createDemoStore(publicData, demoSeed);
  await store.signInDemo("preview-richard");
  let bundle = await store.getBundle();
  assert.equal(bundle.teams.some((t) => t.display_name === "Sharon"), false);
  await store.saveTeam("R4", { slots: { 1: "ENG:Ellis Genge" }, captain: "ENG:Ellis Genge", supersub: null, predictions: {} });
  await store.signInDemo("preview-sharon");
  bundle = await store.getBundle();
  assert.equal(bundle.teams.some((t) => t.display_name === "Richard"), false);
  assert.equal(bundle.teams.some((t) => t.display_name === "Sharon"), true);
  await store.simulateLock("R4");
  bundle = await store.getBundle();
  assert.equal(bundle.teams.filter((t) => t.round_id === "R4").length, 4);
  assert.ok(bundle.teams.some((t) => t.display_name === "Richard"));
  assert.ok(Object.keys(bundle.results).length >= 6);
  await assert.rejects(() => store.saveTeam("R4", { slots: { 1: "ENG:Joe Heyes" } }));
});

test("a published bench is flagged and a starter is not", () => {
  const notes = lineupNotes("IRE:Dan Sheehan", "R4", {
    unionName,
    fixtures: publicData.fixtures,
    lineups: { "R4-01": { home: { starting: ["Andrew Porter"], bench: ["Dan Sheehan"] }, away: { starting: [], bench: [] } } },
  });
  assert.deepEqual(notes, ["On the bench against Argentina"]);
});
