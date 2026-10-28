/** On-phone preview. Nothing here is sent anywhere, and the teams are samples. */

import { canReadTeam, isLocked } from "./lock.js";

export const DEMO_USERS = [
  { id: "preview-richard", displayName: "Richard", isAdmin: true },
  { id: "preview-sharon", displayName: "Sharon", isAdmin: false },
  { id: "preview-brooke", displayName: "Brooke", isAdmin: false },
  { id: "preview-cameron", displayName: "Cameron", isAdmin: false },
];

const KEY = "wfr-preview-v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sampleStat(playerId) {
  const h = hash(playerId);
  return {
    started: h % 5 !== 0,
    tries: h % 7 === 0 ? 1 : 0,
    conversions: h % 11 === 0 ? 1 : 0,
    penalty_goals: h % 9 === 0 ? 1 : 0,
    drop_goals: 0,
    metres_carried: h % 80,
    tackles: (h % 12) + 1,
    potm: h % 19 === 0,
    yellow: h % 29 === 0 ? 1 : 0,
    red: 0,
    sample: true,
  };
}

export function sampleScore(fixtureId) {
  const h = hash(fixtureId);
  let home = 10 + (h % 24);
  let away = 6 + ((h >>> 8) % 21);
  if (home === away) away += 3;
  return { home, away, sample: true };
}

function blankState(data, demoSeed) {
  const teams = {};
  for (const user of DEMO_USERS) teams[user.id] = {};
  const byName = {
    Sharon: "preview-sharon",
    Brooke: "preview-brooke",
    Cameron: "preview-cameron",
  };
  for (const [name, team] of Object.entries((demoSeed && demoSeed.teams) || {})) {
    const id = byName[name];
    if (!id) continue;
    teams[id].R4 = {
      slots: team.slots,
      captain: team.captain,
      supersub: team.supersub,
      predictions: team.predictions || {},
      updated_at: data.asof + "T12:00:00Z",
    };
  }
  return {
    version: 1,
    asof: data.asof,
    sessionUserId: null,
    nowOverride: null,
    teams,
    results: {},
    stats: {},
    lineups: {},
    rounds: clone(data.rounds),
    fixtures: clone(data.fixtures),
    unions: clone(data.unions),
    squad: clone(data.squad),
  };
}

export function createDemoStore(data, demoSeed, storage) {
  const memory = { value: null };
  const box = storage || {
    getItem() {
      return memory.value;
    },
    setItem(_k, value) {
      memory.value = value;
    },
  };

  function load() {
    try {
      const raw = box.getItem(KEY);
      if (!raw) return blankState(data, demoSeed);
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || parsed.asof !== data.asof) return blankState(data, demoSeed);
      return parsed;
    } catch {
      return blankState(data, demoSeed);
    }
  }

  let state = load();

  function save() {
    box.setItem(KEY, JSON.stringify(state));
  }

  function now() {
    return state.nowOverride || new Date().toISOString();
  }

  function user() {
    return DEMO_USERS.find((u) => u.id === state.sessionUserId) || null;
  }

  function roundById(id) {
    return state.rounds.find((r) => r.id === id);
  }

  function bundle() {
    const me = user();
    const clock = now();
    const teams = [];
    for (const person of DEMO_USERS) {
      for (const [roundId, team] of Object.entries(state.teams[person.id] || {})) {
        const round = roundById(roundId);
        if (!me || !canReadTeam(me.id, person.id, round, clock)) continue;
        teams.push({
          user_id: person.id,
          display_name: person.displayName,
          is_admin: person.isAdmin,
          round_id: roundId,
          slots: team.slots || {},
          captain: team.captain || null,
          supersub: team.supersub || null,
          predictions: team.predictions || {},
          updated_at: team.updated_at || null,
        });
      }
    }
    return {
      now: clock,
      preview: true,
      simulated: !!state.nowOverride,
      me: me
        ? { id: me.id, displayName: me.displayName, isAdmin: me.isAdmin, email: null }
        : null,
      profiles: DEMO_USERS.map((u) => ({ id: u.id, display_name: u.displayName, is_admin: u.isAdmin, email: null })),
      rounds: clone(state.rounds),
      fixtures: clone(state.fixtures),
      unions: clone(state.unions),
      squad: clone(state.squad),
      results: clone(state.results),
      stats: clone(state.stats),
      lineups: clone(state.lineups),
      teams,
    };
  }

  return {
    mode: "preview",
    async init() {
      state = load();
      return bundle();
    },
    session() {
      const me = user();
      return me ? { id: me.id, displayName: me.displayName, isAdmin: me.isAdmin, email: null } : null;
    },
    mustSetPassword() {
      return false;
    },
    async signInDemo(userId) {
      if (!DEMO_USERS.some((u) => u.id === userId)) throw new Error("Unknown preview player.");
      state.sessionUserId = userId;
      save();
      return this.session();
    },
    async signOut() {
      state.sessionUserId = null;
      save();
    },
    async getBundle() {
      return bundle();
    },
    async saveTeam(roundId, team) {
      const me = user();
      const round = roundById(roundId);
      if (!me || !round) throw new Error("Choose a round first.");
      if (isLocked(round, now())) throw new Error("That round has locked, so this team can't be changed.");
      state.teams[me.id] = state.teams[me.id] || {};
      state.teams[me.id][roundId] = {
        slots: team.slots || {},
        captain: team.captain || null,
        supersub: team.supersub || null,
        predictions: team.predictions || {},
        updated_at: now(),
      };
      save();
    },
    async resetPreview() {
      const keep = state.sessionUserId;
      state = blankState(data, demoSeed);
      state.sessionUserId = keep;
      save();
    },
    async simulateLock(roundId) {
      const round = roundById(roundId);
      if (!round) throw new Error("Unknown round.");
      state.nowOverride = round.lock_at;
      const playing = {};
      for (const union of state.unions) playing[union.name] = union.code;
      for (const fixture of state.fixtures.filter((f) => f.round_id === roundId)) {
        if (!state.results[fixture.id]) state.results[fixture.id] = sampleScore(fixture.id);
        const codes = [playing[fixture.home], playing[fixture.away]].filter(Boolean);
        state.stats[fixture.id] = state.stats[fixture.id] || {};
        for (const person of DEMO_USERS) {
          const team = (state.teams[person.id] || {})[roundId];
          if (!team) continue;
          const ids = Object.values(team.slots || {}).concat(team.supersub || []);
          for (const playerId of ids) {
            if (!playerId) continue;
            const code = playerId.split(":")[0];
            if (!codes.includes(code)) continue;
            if (!state.stats[fixture.id][playerId]) state.stats[fixture.id][playerId] = sampleStat(playerId);
          }
        }
      }
      save();
    },
    async clearSimulation() {
      state.nowOverride = null;
      for (const [fixtureId, result] of Object.entries(state.results)) {
        if (result && result.sample) delete state.results[fixtureId];
      }
      for (const [fixtureId, bucket] of Object.entries(state.stats)) {
        for (const [playerId, stat] of Object.entries(bucket || {})) {
          if (stat && stat.sample) delete bucket[playerId];
        }
        if (bucket && Object.keys(bucket).length === 0) delete state.stats[fixtureId];
      }
      save();
    },
    async adminUpdateUnion(code, patch) {
      requireAdmin();
      const union = state.unions.find((u) => u.code === code);
      if (!union) throw new Error("Unknown team.");
      Object.assign(union, patch);
      save();
    },
    async adminSavePlayer(player) {
      requireAdmin();
      if (!player.union_code || !player.name || !player.position_group) throw new Error("Add a name and a position.");
      const id = player.id || `${player.union_code}:${player.name}`;
      const row = {
        id,
        union_code: player.union_code,
        name: player.name,
        position_group: player.position_group,
        availability: player.availability || "Squad",
        note: player.note || "",
      };
      const index = state.squad.findIndex((p) => p.id === id);
      if (index >= 0) state.squad[index] = row;
      else state.squad.push(row);
      save();
    },
    async adminDeletePlayer(id) {
      requireAdmin();
      for (const bucket of Object.values(state.stats)) {
        if (bucket[id]) throw new Error("That player already has match stats, so they stay on the list.");
      }
      state.squad = state.squad.filter((p) => p.id !== id);
      save();
    },
    async adminUpdateRound(id, patch) {
      requireAdmin();
      const round = roundById(id);
      if (!round) throw new Error("Unknown round.");
      if (patch.lock_at) round.lock_at = patch.lock_at;
      if (patch.note != null) round.note = patch.note;
      save();
    },
    async adminUpdateFixture(id, patch) {
      requireAdmin();
      const fixture = state.fixtures.find((f) => f.id === id);
      if (!fixture) throw new Error("Unknown match.");
      for (const key of ["home", "away", "venue", "kickoff_at", "status", "expected_announcement"]) {
        if (patch[key] != null) fixture[key] = patch[key];
      }
      save();
    },
    async adminSaveResult(fixtureId, home, away) {
      requireAdmin();
      state.results[fixtureId] = { home: Number(home), away: Number(away), sample: false };
      save();
    },
    async adminDeleteResult(fixtureId) {
      requireAdmin();
      delete state.results[fixtureId];
      save();
    },
    async adminSaveStat(fixtureId, playerId, stat) {
      requireAdmin();
      state.stats[fixtureId] = state.stats[fixtureId] || {};
      state.stats[fixtureId][playerId] = { ...stat, sample: false };
      save();
    },
    async adminDeleteStat(fixtureId, playerId) {
      requireAdmin();
      if (state.stats[fixtureId]) delete state.stats[fixtureId][playerId];
      save();
    },
    async adminSaveLineup(fixtureId, side, lineup) {
      requireAdmin();
      state.lineups[fixtureId] = state.lineups[fixtureId] || {};
      state.lineups[fixtureId][side] = {
        starting: lineup.starting || [],
        bench: lineup.bench || [],
        source: lineup.source || "",
      };
      save();
    },
    async importMatch(fixtureId, payload) {
      requireAdmin();
      if (payload.home != null && payload.away != null) {
        state.results[fixtureId] = { home: Number(payload.home), away: Number(payload.away), sample: false };
      }
      if (payload.stats) {
        state.stats[fixtureId] = state.stats[fixtureId] || {};
        for (const [playerId, stat] of Object.entries(payload.stats)) {
          state.stats[fixtureId][playerId] = { ...stat, sample: false };
        }
      }
      if (payload.lineup) {
        for (const side of ["home", "away"]) {
          if (!payload.lineup[side]) continue;
          await this.adminSaveLineup(fixtureId, side, payload.lineup[side]);
        }
      }
      save();
    },
    async listAccounts() {
      return bundle().profiles;
    },
    async assignPlayer() {
      throw new Error("Names are already set in the preview.");
    },
  };

  function requireAdmin() {
    const me = user();
    if (!me || !me.isAdmin) throw new Error("Only Richard can change that.");
  }
}
