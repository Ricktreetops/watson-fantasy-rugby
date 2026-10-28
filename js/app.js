import { DEMO_USERS, createDemoStore } from "./demo-store.js";
import { inputToIso } from "./format.js";
import { isLocked } from "./lock.js";
import { draw } from "./ui.js";
import { validateTeam } from "./validate.js";

const PAGES = new Set(["home", "pick", "scores", "squads", "rules", "admin"]);
const root = document.querySelector("#app");

const state = {
  booting: true,
  fatal: "",
  mode: "preview",
  session: null,
  mustPassword: false,
  changingPassword: false,
  page: pageFromUrl(),
  notice: "",
  error: "",
  bundle: null,
  rules: null,
  managers: [],
  asof: "",
  roundId: null,
  draft: null,
  draftRound: null,
  supersubQuery: "",
  busy: false,
  admin: { tab: "matches", fixtureId: "R4-01", union: "IRE", accounts: null },
};

let api = null;
let data = null;

function setPage(page, mode) {
  state.page = page;
  const url = new URL(location.href);
  url.searchParams.set("p", page);
  if (mode === "replace") history.replaceState({}, "", url);
  else history.pushState({}, "", url);
}

function pageFromUrl() {
  const page = new URLSearchParams(location.search).get("p");
  return PAGES.has(page) ? page : "home";
}

function isLiveConfig(config) {
  if (!config) return false;
  const url = String(config.supabaseUrl || "");
  const key = String(config.supabaseAnonKey || "");
  return url.startsWith("https://") && !url.includes("YOUR_PROJECT") && key.length > 20 && !key.includes("YOUR_PUBLIC_KEY");
}

function defaultRound(bundle) {
  const open = bundle.rounds.find((round) => !isLocked(round, bundle.now));
  return (open || bundle.rounds[0]).id;
}

function ensureDraft() {
  if (state.page !== "pick" || !state.bundle || !state.session) return;
  if (state.draft && state.draftRound === state.roundId) return;
  const mine = state.bundle.teams.find((t) => t.user_id === state.session.id && t.round_id === state.roundId);
  state.draft = {
    slots: { ...(mine?.slots || {}) },
    captain: mine?.captain || "",
    supersub: mine?.supersub || "",
    predictions: JSON.parse(JSON.stringify(mine?.predictions || {})),
  };
  state.draftRound = state.roundId;
}

function render(opts = {}) {
  ensureDraft();
  const keep = !!opts.keepScroll;
  const y = keep ? window.scrollY : 0;
  const active = document.activeElement;
  const focusId = keep && active && active.tagName === "INPUT" ? active.id : "";
  const caret = focusId ? active.selectionStart : null;
  draw(root, {
    booting: state.booting,
    fatal: state.fatal,
    mode: state.mode,
    session: state.session,
    mustPassword: state.mustPassword,
    changingPassword: state.changingPassword,
    page: state.page,
    notice: state.notice,
    error: state.error,
    bundle: state.bundle,
    rules: state.rules,
    managers: state.managers,
    asof: state.asof,
    roundId: state.roundId,
    draft: state.draft,
    supersubQuery: state.supersubQuery,
    busy: state.busy,
    admin: state.admin,
    demoUsers: DEMO_USERS,
    actions,
  });
  window.scrollTo(0, y);
  if (focusId) {
    const node = document.getElementById(focusId);
    if (node) {
      node.focus();
      if (caret != null && node.setSelectionRange) node.setSelectionRange(caret, caret);
    }
  }
}

async function refreshBundle() {
  state.bundle = await api.getBundle();
  state.session = api.session();
  state.mustPassword = api.mustSetPassword();
  if (!state.roundId) state.roundId = defaultRound(state.bundle);
}

async function run(fn, notice) {
  state.busy = true;
  state.error = "";
  state.notice = "";
  render({ keepScroll: true });
  try {
    await fn();
    if (state.session && !state.mustPassword && state.session.displayName) await refreshBundle();
    state.notice = notice || "";
  } catch (err) {
    state.error = err.message || "That didn't work. Try again.";
  } finally {
    state.busy = false;
    render({ keepScroll: true });
  }
}

function cleanTeam(draft) {
  const slots = {};
  for (const [slot, playerId] of Object.entries(draft.slots || {})) {
    if (playerId) slots[slot] = playerId;
  }
  const predictions = {};
  for (const [id, pick] of Object.entries(draft.predictions || {})) {
    if (pick && pick.winner) predictions[id] = pick;
  }
  return {
    slots,
    captain: draft.captain || null,
    supersub: draft.supersub || null,
    predictions,
  };
}

function lines(text) {
  return String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

const actions = {
  go(page) {
    setPage(PAGES.has(page) ? page : "home");
    state.notice = "";
    state.error = "";
    render();
  },
  async signInDemo(userId) {
    await run(async () => {
      await api.signInDemo(userId);
      state.session = api.session();
      state.draft = null;
      await refreshBundle();
      setPage("home", "replace");
    });
  },
  signInPassword(email, password) {
    if (!email || !password) {
      state.error = "Enter your email and password.";
      render();
      return;
    }
    return run(async () => {
      await api.signInPassword(email, password);
      state.session = api.session();
      state.mustPassword = api.mustSetPassword();
      if (state.session && !state.mustPassword && state.session.displayName) await refreshBundle();
    });
  },
  sendLink(email) {
    if (!email) {
      state.error = "Enter your email first.";
      render();
      return;
    }
    return run(async () => { await api.sendLink(email); }, "Sign-in link sent. Open it on this phone.");
  },
  sendReset(email) {
    if (!email) {
      state.error = "Enter your email first.";
      render();
      return;
    }
    return run(async () => { await api.sendReset(email); }, "Password email sent. Open it on this phone.");
  },
  setPassword(password, confirm) {
    if (password !== confirm) {
      state.error = "Those passwords don't match.";
      render();
      return;
    }
    return run(async () => {
      await api.setPassword(password);
      state.session = api.session();
      state.mustPassword = api.mustSetPassword();
      state.changingPassword = false;
      if (state.session?.displayName) await refreshBundle();
    }, "Password saved.");
  },
  async signOut() {
    await api.signOut();
    state.session = null;
    state.bundle = null;
    state.draft = null;
    state.mustPassword = false;
    state.changingPassword = false;
    state.notice = "";
    state.error = "";
    setPage("home", "replace");
    render();
  },
  startPasswordChange() {
    state.changingPassword = true;
    state.error = "";
    render();
  },
  cancelPasswordChange() {
    state.changingPassword = false;
    render();
  },
  setRound(id) {
    state.roundId = id;
    state.draft = null;
    state.draftRound = null;
    state.notice = "";
    state.error = "";
    render();
  },
  patchDraft(fn) {
    if (!state.draft) return;
    fn(state.draft);
    const picked = new Set(Object.values(state.draft.slots).filter(Boolean));
    if (state.draft.captain && !picked.has(state.draft.captain)) state.draft.captain = "";
    state.error = "";
    render({ keepScroll: true });
  },
  setFinder(value) {
    state.supersubQuery = value;
    render({ keepScroll: true });
  },
  saveTeam() {
    const team = cleanTeam(state.draft);
    const byId = Object.fromEntries(state.bundle.squad.map((p) => [p.id, p]));
    const unionName = Object.fromEntries(state.bundle.unions.map((u) => [u.code, u.name]));
    const check = validateTeam(team, {
      byId,
      unionName,
      rules: state.rules,
      fixtures: state.bundle.fixtures,
      roundId: state.roundId,
    });
    if (!check.ok) {
      state.error = check.errors[0];
      render({ keepScroll: true });
      return;
    }
    return run(() => api.saveTeam(state.roundId, team), "Saved.");
  },
  simulate(roundId) {
    return run(() => api.simulateLock(roundId), "The preview is now after kick-off, with made-up scores.");
  },
  clearSim() {
    return run(() => api.clearSimulation(), "Back to today. Made-up scores removed.");
  },
  resetPreview() {
    return run(async () => {
      await api.resetPreview();
      state.draft = null;
    }, "Preview reset.");
  },
  setAdminTab(tab) {
    state.admin.tab = tab;
    state.error = "";
    render({ keepScroll: true });
  },
  setAdminFixture(id) {
    state.admin.fixtureId = id;
    render({ keepScroll: true });
  },
  setAdminUnion(code) {
    state.admin.union = code;
    render({ keepScroll: true });
  },
  saveResult(fixtureId, home, away) {
    return run(() => api.adminSaveResult(fixtureId, home, away), "Score saved.");
  },
  deleteResult(fixtureId) {
    if (!window.confirm("Remove this score?")) return;
    return run(() => api.adminDeleteResult(fixtureId), "Score removed.");
  },
  saveStat(fixtureId, stat) {
    if (!stat.player_id) {
      state.error = "Choose a player.";
      render({ keepScroll: true });
      return;
    }
    return run(() => api.adminSaveStat(fixtureId, stat.player_id, stat), "Stats saved.");
  },
  deleteStat(fixtureId, playerId) {
    return run(() => api.adminDeleteStat(fixtureId, playerId), "Stats removed.");
  },
  saveLineup(fixtureId, side, starting, bench) {
    return run(() => api.adminSaveLineup(fixtureId, side, { starting: lines(starting), bench: lines(bench) }), "Team sheet saved.");
  },
  importMatch(fixtureId, text) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      state.error = "That isn't valid JSON. Check the commas and quotes.";
      render({ keepScroll: true });
      return;
    }
    const unknown = Object.keys(payload.stats || {}).filter((id) => !state.bundle.squad.some((p) => p.id === id));
    if (unknown.length) {
      state.error = `${unknown[0]} isn't on a squad list.`;
      render({ keepScroll: true });
      return;
    }
    return run(() => api.importMatch(fixtureId, payload), "Match imported.");
  },
  saveUnion(code, patch) {
    return run(() => api.adminUpdateUnion(code, patch), "Squad note saved.");
  },
  savePlayer(player) {
    if (!player.name) {
      state.error = "Enter the player's name.";
      render({ keepScroll: true });
      return;
    }
    return run(() => api.adminSavePlayer(player), "Player saved.");
  },
  deletePlayer(id) {
    const player = state.bundle.squad.find((p) => p.id === id);
    if (!window.confirm(`Remove ${player ? player.name : "this player"} from the squad?`)) return;
    return run(() => api.adminDeletePlayer(id), "Player removed.");
  },
  saveRound(id, lockValue) {
    const lock_at = inputToIso(lockValue);
    if (!lock_at) {
      state.error = "Enter a lock time.";
      render();
      return;
    }
    return run(() => api.adminUpdateRound(id, { lock_at }), "Lock time saved.");
  },
  saveFixture(id, patch) {
    return run(() => api.adminUpdateFixture(id, {
      home: patch.home,
      away: patch.away,
      venue: patch.venue,
      kickoff_at: inputToIso(patch.kickoff_at),
    }), "Match saved.");
  },
  loadAccounts() {
    return run(async () => {
      state.admin.accounts = await api.listAccounts();
    });
  },
  assign(userId, name) {
    return run(async () => {
      await api.assignPlayer(userId, name);
      state.admin.accounts = await api.listAccounts();
    }, "Name saved.");
  },
};

async function boot() {
  try {
    const [league, seed] = await Promise.all([
      fetch(new URL("../data/public.json", import.meta.url)).then((res) => res.json()),
      fetch(new URL("../data/demo-seed.json", import.meta.url)).then((res) => res.json()),
    ]);
    data = league;
    state.rules = league.rules;
    state.managers = league.managers;
    state.asof = league.asof;
    if (isLiveConfig(window.WFR_CONFIG)) {
      const { createLiveClient } = await import("./live.js");
      api = createLiveClient(window.WFR_CONFIG);
      state.mode = "live";
    } else {
      api = createDemoStore(league, seed, window.localStorage);
      state.mode = "preview";
    }
    await api.init();
    state.session = api.session();
    state.mustPassword = api.mustSetPassword();
    if (state.session && !state.mustPassword && state.session.displayName) await refreshBundle();
  } catch (err) {
    const message = err && err.message ? err.message : "";
    state.fatal = /fetch|import|network|failed/i.test(message)
      ? "The league didn't open. Check the connection and try again."
      : (message || "The league didn't open. Try again in a moment.");
  } finally {
    state.booting = false;
    render();
  }
}

window.addEventListener("popstate", () => {
  state.page = pageFromUrl();
  render();
});

boot();
