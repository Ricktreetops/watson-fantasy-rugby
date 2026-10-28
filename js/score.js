/** Scoring for Watson Family Fantasy Rugby. Same sums as the league scorer. */

export const FORWARD_GROUPS = new Set(["PR", "HK", "LK", "BR", "FX"]);

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function marginBand(margin, bands) {
  const m = num(margin);
  for (let i = 0; i < bands.length; i++) {
    const [lo, hi] = bands[i];
    if (m >= lo && m <= hi) return i;
  }
  return -1;
}

export function isForward(group) {
  return FORWARD_GROUPS.has(group);
}

/** Points for one player's stat line in one match, before captain or supersub. */
export function playerPoints(stats, group, rules) {
  if (!stats) return 0;
  const pp = rules.player_points;
  const tries = num(stats.tries);
  let points = (isForward(group) ? pp.try_forward : pp.try_back) * tries;
  points += pp.conversion * num(stats.conversions);
  const penalties = stats.penalty_goals != null ? stats.penalty_goals : stats.penalties;
  points += pp.penalty_goal * num(penalties);
  points += pp.drop_goal * num(stats.drop_goals);
  points += pp.metres_carried_per_10 * Math.floor(num(stats.metres_carried) / 10);
  points += pp.tackle * num(stats.tackles);
  if (stats.potm) points += pp.player_of_the_match;
  points += pp.yellow_card * num(stats.yellow);
  points += pp.red_card * num(stats.red);
  return points;
}

export function explainPlayer(stats, group, rules) {
  if (!stats) return { points: 0, parts: [] };
  const pp = rules.player_points;
  const parts = [];
  const tries = num(stats.tries);
  if (tries) {
    const each = isForward(group) ? pp.try_forward : pp.try_back;
    parts.push({ label: tries === 1 ? "Try" : `${tries} tries`, points: each * tries });
  }
  const conv = num(stats.conversions);
  if (conv) parts.push({ label: conv === 1 ? "Conversion" : `${conv} conversions`, points: pp.conversion * conv });
  const penalties = num(stats.penalty_goals != null ? stats.penalty_goals : stats.penalties);
  if (penalties) parts.push({ label: penalties === 1 ? "Penalty goal" : `${penalties} penalty goals`, points: pp.penalty_goal * penalties });
  const drops = num(stats.drop_goals);
  if (drops) parts.push({ label: drops === 1 ? "Drop goal" : `${drops} drop goals`, points: pp.drop_goal * drops });
  const metres = Math.floor(num(stats.metres_carried) / 10);
  if (metres) parts.push({ label: `${num(stats.metres_carried)} metres`, points: pp.metres_carried_per_10 * metres });
  const tackles = num(stats.tackles);
  if (tackles) parts.push({ label: tackles === 1 ? "Tackle" : `${tackles} tackles`, points: pp.tackle * tackles });
  if (stats.potm) parts.push({ label: "Player of the Match", points: pp.player_of_the_match });
  const yellow = num(stats.yellow);
  if (yellow) parts.push({ label: yellow === 1 ? "Yellow card" : `${yellow} yellow cards`, points: pp.yellow_card * yellow });
  const red = num(stats.red);
  if (red) parts.push({ label: red === 1 ? "Red card" : `${red} red cards`, points: pp.red_card * red });
  const points = playerPoints(stats, group, rules);
  return { points, parts };
}

export function predictionPoints(fixture, pick, result, rules) {
  if (!pick || !result || pick.winner == null || pick.winner === "") return { points: 0, correctWinner: 0, parts: [] };
  const home = num(result.home);
  const away = num(result.away);
  const actual = home === away ? "Draw" : home > away ? fixture.home : fixture.away;
  const actualMargin = Math.abs(home - away);
  const bonus = rules.prediction_bonus;
  if (pick.winner === "Draw") {
    if (actual === "Draw") return { points: 8, correctWinner: 0, parts: [{ label: "Correct draw", points: 8 }] };
    return { points: 0, correctWinner: 0, parts: [] };
  }
  if (pick.winner !== actual) return { points: 0, correctWinner: 0, parts: [] };
  let points = bonus.winner_points;
  const parts = [{ label: "Correct winner", points: bonus.winner_points }];
  const pickedMargin = num(pick.margin);
  if (marginBand(pickedMargin, bonus.margin_bands) === marginBand(actualMargin, bonus.margin_bands)) {
    points += bonus.margin_band_points;
    parts.push({ label: "Margin in the right band", points: bonus.margin_band_points });
  }
  if (pickedMargin === actualMargin) {
    points += bonus.exact_margin_points;
    parts.push({ label: "Exact margin", points: bonus.exact_margin_points });
  }
  return { points, correctWinner: 1, parts };
}

function statsFor(statsByFixture, fixtureId, playerId) {
  const bucket = statsByFixture[fixtureId] || {};
  return bucket[playerId] || null;
}

/**
 * Score one saved team for one round.
 * fixtures: [{id, round_id, home, away}]
 * resultsById: {fixtureId: {home, away}}
 * statsByFixture: {fixtureId: {playerId: stats}}
 * groupOf(playerId) -> position group or ""
 */
export function scoreTeam(team, roundId, ctx) {
  const rules = ctx.rules;
  const fixtures = (ctx.fixtures || []).filter((f) => f.round_id === roundId || f.round === roundId);
  const empty = {
    slots: [],
    supersub: null,
    predictions: [],
    fantasyPoints: 0,
    predictionPoints: 0,
    correctWinners: 0,
    total: 0,
  };
  if (!team) return empty;
  const slots = team.slots || {};
  const slotRows = [];
  let fantasy = 0;
  for (const key of Object.keys(slots)) {
    const playerId = slots[key];
    if (!playerId) continue;
    const group = ctx.groupOf(playerId);
    let raw = 0;
    const matches = [];
    for (const fixture of fixtures) {
      const stats = statsFor(ctx.statsByFixture || {}, fixture.id, playerId);
      if (!stats) continue;
      const explained = explainPlayer(stats, group, rules);
      raw += explained.points;
      matches.push({ fixtureId: fixture.id, label: `${fixture.home} v ${fixture.away}`, ...explained });
    }
    const captain = playerId === team.captain;
    const multiplier = captain ? num(rules.captain_multiplier || 2) : 1;
    const points = raw * multiplier;
    fantasy += points;
    slotRows.push({ slot: String(key), playerId, raw, multiplier, points, captain, matches });
  }
  let supersub = null;
  if (team.supersub) {
    const group = ctx.groupOf(team.supersub);
    const matches = [];
    let points = 0;
    for (const fixture of fixtures) {
      const stats = statsFor(ctx.statsByFixture || {}, fixture.id, team.supersub);
      if (!stats) continue;
      const explained = explainPlayer(stats, group, rules);
      const multiplier = stats.started ? num(rules.supersub.if_starts_multiplier) : num(rules.supersub.multiplier);
      const got = explained.points * multiplier;
      points += got;
      matches.push({
        fixtureId: fixture.id,
        label: `${fixture.home} v ${fixture.away}`,
        raw: explained.points,
        multiplier,
        points: got,
        started: !!stats.started,
        parts: explained.parts,
      });
    }
    fantasy += points;
    supersub = { playerId: team.supersub, points, matches };
  }
  const predictions = [];
  let predictionPointsTotal = 0;
  let correctWinners = 0;
  const picks = team.predictions || {};
  for (const fixture of fixtures) {
    const result = (ctx.resultsById || {})[fixture.id];
    if (!result) continue;
    const scored = predictionPoints(fixture, picks[fixture.id], result, rules);
    predictionPointsTotal += scored.points;
    correctWinners += scored.correctWinner;
    predictions.push({
      fixtureId: fixture.id,
      label: `${fixture.home} v ${fixture.away}`,
      pick: picks[fixture.id] || null,
      result,
      ...scored,
    });
  }
  return {
    slots: slotRows,
    supersub,
    predictions,
    fantasyPoints: fantasy,
    predictionPoints: predictionPointsTotal,
    correctWinners,
    total: fantasy + predictionPointsTotal,
  };
}

/** entries: [{name, teams: {roundId: team}}] in the order used as a final tie-break. */
export function seasonBoard(entries, ctx) {
  const rows = entries.map((entry, index) => {
    let fantasyPoints = 0;
    let predictionPoints = 0;
    let correctWinners = 0;
    const rounds = {};
    for (const roundId of Object.keys(entry.teams || {})) {
      const scored = scoreTeam(entry.teams[roundId], roundId, ctx);
      rounds[roundId] = scored;
      fantasyPoints += scored.fantasyPoints;
      predictionPoints += scored.predictionPoints;
      correctWinners += scored.correctWinners;
    }
    return {
      name: entry.name,
      index,
      fantasyPoints,
      predictionPoints,
      correctWinners,
      points: fantasyPoints + predictionPoints,
      rounds,
    };
  });
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.fantasyPoints !== a.fantasyPoints) return b.fantasyPoints - a.fantasyPoints;
    if (b.correctWinners !== a.correctWinners) return b.correctWinners - a.correctWinners;
    return a.index - b.index;
  });
  return rows;
}
