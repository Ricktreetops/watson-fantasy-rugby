/** Real league. Passwords stay with the hosted login service. */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm";

const SET_KEY = "wfr-set-password";

function arrivalType() {
  const hash = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  return hash.get("type") || query.get("type") || "";
}

function rememberArrival() {
  const type = arrivalType();
  if (type === "invite" || type === "recovery") sessionStorage.setItem(SET_KEY, "1");
}

function cleanUrl() {
  const url = new URL(location.href);
  const dirty =
    url.hash.includes("access_token") ||
    url.searchParams.has("token_hash") ||
    url.searchParams.has("code") ||
    url.searchParams.has("type");
  if (!dirty) return;
  url.hash = "";
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.searchParams.delete("code");
  history.replaceState({}, "", url);
}

function friendly(error, fallback) {
  const message = (error && error.message) || "";
  const lower = message.toLowerCase();
  if (!message) return fallback;
  if (lower.includes("invalid login")) return "That email and password don't match.";
  if (lower.includes("email not confirmed")) return "Open the invite email first, then choose a password.";
  if (lower.includes("user not found") || lower.includes("signups not allowed") || lower.includes("signup")) {
    return "There's no login for that email. Richard sends the invite.";
  }
  if (lower.includes("row-level security") || lower.includes("round has locked") || lower.includes("locked")) {
    return "That round has locked, so this team can't be changed.";
  }
  if (message.length < 180 && !lower.includes("jwt") && !lower.includes("token")) return message;
  return fallback;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function createLiveClient(config) {
  rememberArrival();
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      flowType: "implicit",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  let session = null;
  let profile = null;

  async function refresh() {
    const query = new URLSearchParams(location.search);
    if (query.get("token_hash") && query.get("type")) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: query.get("token_hash"),
        type: query.get("type"),
      });
      if (error) throw new Error(friendly(error, "That link has expired. Ask Richard to send a new one."));
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(friendly(error, "The login didn't come through. Try the link again."));
    session = data.session;
    cleanUrl();
    profile = null;
    if (session) {
      const { data: rows, error: profileError } = await supabase.rpc("ensure_profile");
      if (profileError) throw new Error(friendly(profileError, "Your login isn't on the league list yet."));
      const row = Array.isArray(rows) ? rows[0] : rows;
      profile = row || null;
    }
  }

  function me() {
    if (!session || !profile) return null;
    return {
      id: session.user.id,
      email: session.user.email || null,
      displayName: profile.display_name || null,
      isAdmin: !!profile.is_admin,
    };
  }

  function gate() {
    if (!session) return false;
    if (sessionStorage.getItem(SET_KEY) === "1") return true;
    return session.user.user_metadata?.password_chosen !== true;
  }

  async function requireAdmin() {
    if (!me()?.isAdmin) throw new Error("Only Richard can change that.");
  }

  return {
    mode: "live",
    async init() {
      await refresh();
    },
    session() {
      return me();
    },
    mustSetPassword() {
      return gate();
    },
    async signInPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(friendly(error, "That email and password don't match."));
      sessionStorage.removeItem(SET_KEY);
      const { data } = await supabase.auth.getUser();
      if (data.user && data.user.user_metadata?.password_chosen !== true) {
        await supabase.auth.updateUser({ data: { password_chosen: true } });
      }
      await refresh();
    },
    async sendLink(email) {
      const redirect = `${location.origin}${location.pathname}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: redirect },
      });
      if (error) throw new Error(friendly(error, "There's no login for that email. Richard sends the invite."));
    },
    async sendReset(email) {
      const redirect = `${location.origin}${location.pathname}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
      if (error) throw new Error(friendly(error, "That reset email couldn't be sent."));
    },
    async setPassword(password) {
      if (!password || password.length < 8) throw new Error("Use at least 8 characters.");
      const { error } = await supabase.auth.updateUser({
        password,
        data: { password_chosen: true },
      });
      if (error) throw new Error(friendly(error, "That password wasn't saved. Try a different one."));
      sessionStorage.removeItem(SET_KEY);
      await refresh();
    },
    async signOut() {
      sessionStorage.removeItem(SET_KEY);
      await supabase.auth.signOut();
      session = null;
      profile = null;
    },
    async getBundle() {
      if (!session) throw new Error("Log in first.");
      const [clock, profiles, rounds, fixtures, unions, squad, results, stats, lineups, teams] = await Promise.all([
        supabase.rpc("server_now"),
        supabase.from("profiles").select("id, display_name, is_admin"),
        supabase.from("rounds").select("*").order("sort_order"),
        supabase.from("fixtures").select("*").order("kickoff_at"),
        supabase.from("unions").select("*").order("name"),
        supabase.from("players").select("*").order("name"),
        supabase.from("results").select("*"),
        supabase.from("player_match_stats").select("*"),
        supabase.from("lineups").select("*"),
        supabase.from("fantasy_teams").select("user_id, round_id, slots, captain, supersub, predictions, updated_at"),
      ]);
      for (const part of [profiles, rounds, fixtures, unions, squad, results, stats, lineups, teams]) {
        if (part.error) throw new Error(friendly(part.error, "The league didn't load. Try again in a moment."));
      }
      const names = new Map((profiles.data || []).map((p) => [p.id, p]));
      const resultMap = {};
      for (const row of results.data || []) {
        resultMap[row.fixture_id] = { home: row.home_score, away: row.away_score };
      }
      const statMap = {};
      for (const row of stats.data || []) {
        statMap[row.fixture_id] = statMap[row.fixture_id] || {};
        statMap[row.fixture_id][row.player_id] = row;
      }
      const lineupMap = {};
      for (const row of lineups.data || []) {
        lineupMap[row.fixture_id] = lineupMap[row.fixture_id] || {};
        lineupMap[row.fixture_id][row.side] = {
          starting: row.starting || [],
          bench: row.bench || [],
          source: row.source || "",
        };
      }
      return {
        now: clock.data || new Date().toISOString(),
        preview: false,
        simulated: false,
        me: me(),
        profiles: profiles.data || [],
        rounds: rounds.data || [],
        fixtures: fixtures.data || [],
        unions: unions.data || [],
        squad: squad.data || [],
        results: resultMap,
        stats: statMap,
        lineups: lineupMap,
        teams: (teams.data || []).map((team) => ({
          ...team,
          display_name: names.get(team.user_id)?.display_name || "Player",
          is_admin: !!names.get(team.user_id)?.is_admin,
        })),
      };
    },
    async saveTeam(roundId, team) {
      const person = me();
      if (!person?.displayName) throw new Error("Your login isn't matched to a player yet.");
      const { error } = await supabase.from("fantasy_teams").upsert(
        {
          user_id: person.id,
          round_id: roundId,
          slots: team.slots || {},
          captain: team.captain || null,
          supersub: team.supersub || null,
          predictions: team.predictions || {},
        },
        { onConflict: "user_id,round_id" }
      );
      if (error) throw new Error(friendly(error, "The team wasn't saved."));
    },
    async adminUpdateUnion(code, patch) {
      await requireAdmin();
      const { error } = await supabase.from("unions").update(patch).eq("code", code);
      if (error) throw new Error(friendly(error, "The squad note wasn't saved."));
    },
    async adminSavePlayer(player) {
      await requireAdmin();
      const id = player.id || `${player.union_code}:${player.name}`;
      const { error } = await supabase.from("players").upsert({
        id,
        union_code: player.union_code,
        name: player.name,
        position_group: player.position_group,
        availability: player.availability || "Squad",
        note: player.note || "",
      });
      if (error) throw new Error(friendly(error, "The player wasn't saved."));
    },
    async adminDeletePlayer(id) {
      await requireAdmin();
      const { error } = await supabase.from("players").delete().eq("id", id);
      if (error) throw new Error(friendly(error, "That player already has match stats, so they stay on the list."));
    },
    async adminUpdateRound(id, patch) {
      await requireAdmin();
      const { error } = await supabase.from("rounds").update(patch).eq("id", id);
      if (error) throw new Error(friendly(error, "The lock time wasn't saved."));
    },
    async adminUpdateFixture(id, patch) {
      await requireAdmin();
      const { error } = await supabase.from("fixtures").update(patch).eq("id", id);
      if (error) throw new Error(friendly(error, "The match wasn't saved."));
    },
    async adminSaveResult(fixtureId, home, away) {
      await requireAdmin();
      const { error } = await supabase.from("results").upsert({
        fixture_id: fixtureId,
        home_score: num(home),
        away_score: num(away),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(friendly(error, "The score wasn't saved."));
    },
    async adminDeleteResult(fixtureId) {
      await requireAdmin();
      const { error } = await supabase.from("results").delete().eq("fixture_id", fixtureId);
      if (error) throw new Error(friendly(error, "The score wasn't removed."));
    },
    async adminSaveStat(fixtureId, playerId, stat) {
      await requireAdmin();
      const { error } = await supabase.from("player_match_stats").upsert({
        fixture_id: fixtureId,
        player_id: playerId,
        started: !!stat.started,
        tries: num(stat.tries),
        conversions: num(stat.conversions),
        penalty_goals: num(stat.penalty_goals),
        drop_goals: num(stat.drop_goals),
        metres_carried: num(stat.metres_carried),
        tackles: num(stat.tackles),
        potm: !!stat.potm,
        yellow: num(stat.yellow),
        red: num(stat.red),
      });
      if (error) throw new Error(friendly(error, "Those stats weren't saved."));
    },
    async adminDeleteStat(fixtureId, playerId) {
      await requireAdmin();
      const { error } = await supabase
        .from("player_match_stats")
        .delete()
        .eq("fixture_id", fixtureId)
        .eq("player_id", playerId);
      if (error) throw new Error(friendly(error, "Those stats weren't removed."));
    },
    async adminSaveLineup(fixtureId, side, lineup) {
      await requireAdmin();
      const { error } = await supabase.from("lineups").upsert({
        fixture_id: fixtureId,
        side,
        starting: lineup.starting || [],
        bench: lineup.bench || [],
        source: lineup.source || "",
      });
      if (error) throw new Error(friendly(error, "The team sheet wasn't saved."));
    },
    async importMatch(fixtureId, payload) {
      if (payload.home != null && payload.away != null) await this.adminSaveResult(fixtureId, payload.home, payload.away);
      for (const [playerId, stat] of Object.entries(payload.stats || {})) {
        await this.adminSaveStat(fixtureId, playerId, stat);
      }
      for (const side of ["home", "away"]) {
        if (payload.lineup && payload.lineup[side]) await this.adminSaveLineup(fixtureId, side, payload.lineup[side]);
      }
    },
    async listAccounts() {
      await requireAdmin();
      const { data, error } = await supabase.rpc("league_accounts");
      if (error) throw new Error(friendly(error, "The logins didn't load."));
      return data || [];
    },
    async assignPlayer(userId, name) {
      await requireAdmin();
      const { error } = await supabase.rpc("assign_player", { target: userId, player_name: name });
      if (error) throw new Error(friendly(error, "That name wasn't saved."));
    },
  };
}
