/** A round locks at the kick-off of its first match. The clock is the server's in the real league. */

export function isLocked(round, now) {
  if (!round || !round.lock_at) return true;
  return new Date(round.lock_at).getTime() <= new Date(now).getTime();
}

export function canReadTeam(viewerId, ownerId, round, now) {
  if (!viewerId || !ownerId) return false;
  if (viewerId === ownerId) return true;
  if (!round || !round.lock_at) return false;
  return isLocked(round, now);
}

export function canWriteTeam(viewerId, ownerId, round, now) {
  if (!viewerId || !ownerId) return false;
  return viewerId === ownerId && !isLocked(round, now);
}

/** Picked player vs a published matchday 23. Names must match the squad list. */
export function lineupNotes(playerId, roundId, ctx) {
  if (!playerId) return [];
  const name = playerId.split(":").slice(1).join(":");
  const code = playerId.split(":")[0];
  const team = (ctx.unionName || {})[code];
  if (!team) return [];
  const notes = [];
  for (const fixture of ctx.fixtures || []) {
    if (fixture.round_id !== roundId) continue;
    let side = null;
    let opponent = "";
    if (fixture.home === team) {
      side = "home";
      opponent = fixture.away;
    } else if (fixture.away === team) {
      side = "away";
      opponent = fixture.home;
    } else continue;
    const lineup = ((ctx.lineups || {})[fixture.id] || {})[side];
    if (!lineup || !Array.isArray(lineup.starting) || lineup.starting.length === 0) continue;
    if (lineup.starting.includes(name)) continue;
    if (Array.isArray(lineup.bench) && lineup.bench.includes(name)) {
      notes.push(`On the bench against ${opponent}`);
    } else {
      notes.push(`Not in the 23 against ${opponent}`);
    }
  }
  return notes;
}
