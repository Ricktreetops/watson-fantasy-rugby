/** Team checks. Errors block a save. Warnings mean the team is not finished. */

export function playerCode(playerId) {
  return String(playerId || "").split(":")[0];
}

export function playerName(playerId) {
  const parts = String(playerId || "").split(":");
  return parts.slice(1).join(":") || "";
}

export function validateTeam(team, ctx) {
  const errors = [];
  const warnings = [];
  const slots = (team && team.slots) || {};
  const byId = ctx.byId || {};
  const allowed = ctx.rules.slots;
  const max = ctx.rules.max_per_nation;
  const seen = new Map();
  const counts = {};

  for (let n = 1; n <= 15; n++) {
    const playerId = slots[String(n)];
    if (!playerId) {
      warnings.push(`Position ${n} is still empty.`);
      continue;
    }
    const player = byId[playerId];
    if (!player) {
      errors.push(`Position ${n} is not a named squad player.`);
      continue;
    }
    const groups = allowed[String(n)] || [];
    if (!groups.includes(player.position_group)) {
      errors.push(`${player.name} cannot play at ${n}.`);
    }
    if (seen.has(playerId)) errors.push(`${player.name} is picked more than once.`);
    seen.set(playerId, n);
    counts[player.union_code] = (counts[player.union_code] || 0) + 1;
    if (player.availability === "Out") warnings.push(`${player.name} is marked out of the squad.`);
    if (player.availability === "Doubt") warnings.push(`${player.name} is a doubt.`);
  }

  if (!team || !team.captain) warnings.push("Choose a captain.");
  else if (!seen.has(team.captain)) errors.push("Your captain has to be one of your 15.");

  if (!team || !team.supersub) warnings.push("Choose a Supersub if you want one.");
  else {
    const sub = byId[team.supersub];
    if (!sub) errors.push("That Supersub is not a named squad player.");
    else {
      if (seen.has(team.supersub)) errors.push("Your Supersub has to be someone outside your 15.");
      counts[sub.union_code] = (counts[sub.union_code] || 0) + 1;
      if (sub.availability === "Out") warnings.push(`${sub.name} (Supersub) is marked out of the squad.`);
    }
  }

  for (const [code, n] of Object.entries(counts)) {
    if (n > max) {
      const name = (ctx.unionName || {})[code] || code;
      errors.push(`${name} has ${n} players. The maximum is ${max}.`);
    }
  }

  const predictions = (team && team.predictions) || {};
  const fixtures = (ctx.fixtures || []).filter((f) => f.round_id === ctx.roundId);
  for (const [fixtureId, pick] of Object.entries(predictions)) {
    if (!pick || !pick.winner) continue;
    const fixture = fixtures.find((f) => f.id === fixtureId);
    if (!fixture) {
      errors.push("A prediction is for a match outside this round.");
      continue;
    }
    if (![fixture.home, fixture.away, "Draw"].includes(pick.winner)) {
      errors.push(`Pick ${fixture.home}, ${fixture.away}, or a draw.`);
    }
    if (pick.winner !== "Draw" && pick.margin != null && pick.margin !== "") {
      const margin = Number(pick.margin);
      if (!Number.isInteger(margin) || margin < 0 || margin > 200) {
        errors.push("A winning margin has to be a whole number.");
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, complete: errors.length === 0 && warnings.length === 0 };
}
