import { el } from "./dom.js";
import { formatWhen, fmtPts, GROUP_ORDER, inputValue, sortUnions } from "./format.js";
import { isLocked, lineupNotes } from "./lock.js";
import { scoreTeam, seasonBoard } from "./score.js";
import { playerName, validateTeam } from "./validate.js";

const STATUS = {
  announced: "Squad announced",
  "announced (updated)": "Squad announced, since updated",
  "training squad": "Training squad – may change",
  "training squad (updated)": "Training camp list – may change",
  "provisional (London camp)": "Provisional camp group. The final squad can still change.",
  provisional: "Provisional. More players may be added.",
  TBC: "Squad not named yet, so nobody from this team can be picked.",
};

const PAGES = [
  ["home", "Home"],
  ["pick", "Pick"],
  ["scores", "Scores"],
  ["squads", "Squads"],
];

export function draw(root, ctx) {
  root.replaceChildren(view(ctx));
}

function view(ctx) {
  if (ctx.booting) return el("main", { class: "loading" }, "Loading the league…");
  if (ctx.fatal) {
    return el("main", { class: "card" }, [
      el("h2", {}, "The league didn't open"),
      el("p", {}, ctx.fatal),
    ]);
  }
  if (!ctx.session) return login(ctx);
  if (ctx.mustPassword || ctx.changingPassword) return passwordScreen(ctx);
  if (!ctx.session.displayName) return unlinked(ctx);
  return shell(ctx);
}

function login(ctx) {
  return el("div", {}, [
    head(ctx, null),
    el("main", {}, [
      ctx.mode === "preview" ? previewBanner() : null,
      ctx.mode === "preview"
        ? el("div", { class: "card" }, [
            el("h2", {}, "Try it on this phone"),
            el("p", { class: "small" }, "Pick a name to walk through the screens. This is not the shared league, and nothing is sent to anyone else."),
            el("div", { class: "who" }, ctx.demoUsers.map((user) =>
              el("button", {
                class: "primary",
                type: "button",
                onClick: () => ctx.actions.signInDemo(user.id),
              }, `Continue as ${user.displayName}`)
            )),
          ])
        : el("form", {
            class: "card",
            onSubmit: (e) => {
              e.preventDefault();
              const data = new FormData(e.target);
              ctx.actions.signInPassword(data.get("email"), data.get("password"));
            },
          }, [
            el("h2", {}, "Log in"),
            field("Email", el("input", { name: "email", type: "email", autocomplete: "username", required: true })),
            field("Password", el("input", { name: "password", type: "password", autocomplete: "current-password", required: true })),
            message(ctx),
            el("button", { class: "primary", type: "submit" }, "Log in"),
            el("button", {
              class: "secondary",
              type: "button",
              onClick: (e) => {
                const email = new FormData(e.target.form).get("email");
                ctx.actions.sendLink(email);
              },
            }, "Email me a sign-in link"),
            el("button", {
              class: "ghost",
              type: "button",
              onClick: (e) => ctx.actions.sendReset(new FormData(e.target.form).get("email")),
            }, "I forgot my password"),
            el("p", { class: "small" }, "There's no sign-up. Richard invites the four players, and each person chooses their own password from that email."),
          ]),
    ]),
  ]);
}

function passwordScreen(ctx) {
  return el("div", {}, [
    head(ctx, ctx.session),
    el("main", {}, [
      el("form", {
        class: "card",
        onSubmit: (e) => {
          e.preventDefault();
          const data = new FormData(e.target);
          ctx.actions.setPassword(data.get("password"), data.get("confirm"));
        },
      }, [
        el("h2", {}, ctx.changingPassword ? "Change password" : "Choose a password"),
        ctx.session.email ? el("p", { class: "small" }, ctx.session.email) : null,
        el("p", {}, "Use at least 8 characters. It stays with the login service, not in this league's files."),
        field("New password", el("input", { name: "password", type: "password", autocomplete: "new-password", required: true, minlength: "8" })),
        field("Type it again", el("input", { name: "confirm", type: "password", autocomplete: "new-password", required: true, minlength: "8" })),
        message(ctx),
        el("button", { class: "primary", type: "submit" }, "Save password"),
        ctx.changingPassword
          ? el("button", { class: "ghost", type: "button", onClick: () => ctx.actions.cancelPasswordChange() }, "Cancel")
          : null,
      ]),
    ]),
  ]);
}

function unlinked(ctx) {
  return el("div", {}, [
    head(ctx, ctx.session),
    el("main", {}, [
      el("div", { class: "card" }, [
        el("h2", {}, "Almost in"),
        el("p", {}, "This login isn't matched to a player yet. Ask Richard to open Family logins and choose your name."),
        ctx.session.email ? el("p", { class: "small" }, ctx.session.email) : null,
        el("button", { class: "secondary", type: "button", onClick: () => ctx.actions.signOut() }, "Log out"),
      ]),
    ]),
  ]);
}

function shell(ctx) {
  const page = PAGES.some(([id]) => id === ctx.page) || ctx.page === "rules" || ctx.page === "admin" ? ctx.page : "home";
  return el("div", {}, [
    head(ctx, ctx.session),
    el("main", {}, [
      ctx.mode === "preview" ? previewBanner() : null,
      message(ctx),
      page === "home" ? home(ctx) : null,
      page === "pick" ? pick(ctx) : null,
      page === "scores" ? scores(ctx) : null,
      page === "squads" ? squads(ctx, false) : null,
      page === "rules" ? rulesPage(ctx) : null,
      page === "admin" ? adminPage(ctx) : null,
    ]),
    el("nav", { class: "bottom" }, PAGES.map(([id, label]) =>
      el("button", {
        type: "button",
        "aria-current": page === id ? "page" : null,
        onClick: () => ctx.actions.go(id),
      }, label)
    )),
  ]);
}

function head(ctx, session) {
  return el("header", { class: "top" }, [
    el("div", { class: "row" }, [
      el("div", {}, [
        el("h1", {}, "Watson Family Fantasy Rugby"),
        el("p", {}, "Nations Championship 2026"),
      ]),
      session
        ? el("button", { class: "link", type: "button", onClick: () => ctx.actions.signOut() }, "Log out")
        : null,
    ]),
  ]);
}

function previewBanner() {
  return el("div", { class: "banner" }, [
    el("strong", {}, "Preview only"),
    "This is not the shared league yet. Picks stay on this phone. Nothing is sent to the others.",
  ]);
}

function message(ctx) {
  return el("div", {}, [
    ctx.notice ? el("div", { class: "ok", role: "status" }, ctx.notice) : null,
    ctx.error ? el("div", { class: "err", role: "alert" }, ctx.error) : null,
  ]);
}

function home(ctx) {
  const round = selectedRound(ctx);
  const locked = round && isLocked(round, ctx.bundle.now);
  const mine = myTeam(ctx, round && round.id);
  const board = season(ctx);
  const sample = Object.values(ctx.bundle.results).some((r) => r.sample);
  return el("div", {}, [
    sample ? el("div", { class: "banner" }, [el("strong", {}, "Made-up scores"), "The table is using pretend results so you can see how it looks. They are not real."]) : null,
    el("div", { class: "card" }, [
      el("h2", {}, `Hello, ${ctx.session.displayName}`),
      round
        ? el("p", {}, [
            el("b", {}, round.name),
            locked
              ? " is locked."
              : ` locks ${formatWhen(round.lock_at)}, at the first kick-off.`,
          ])
        : null,
      el("p", {}, teamStatus(mine, locked)),
      el("button", { class: "primary", type: "button", onClick: () => ctx.actions.go("pick") }, locked ? "View your team" : "Pick your team"),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "Table"),
      boardTable(ctx, board),
      el("p", { class: "small" }, "Totals include locked rounds only. An open round stays off the table until kick-off."),
    ]),
    round ? fixtureCard(ctx, round) : null,
    el("div", { class: "card links" }, [
      el("button", { class: "secondary", type: "button", onClick: () => ctx.actions.go("rules") }, "How scoring works"),
      el("button", { class: "secondary", type: "button", onClick: () => ctx.actions.go("squads") }, "Squads"),
      ctx.session.isAdmin
        ? el("button", { class: "secondary", type: "button", onClick: () => ctx.actions.go("admin") }, "Squads, scores and logins")
        : null,
      ctx.mode === "live"
        ? el("button", { class: "ghost", type: "button", onClick: () => ctx.actions.startPasswordChange() }, "Change password")
        : null,
    ]),
    ctx.mode === "preview" ? previewTools(ctx, round) : null,
  ]);
}

function previewTools(ctx, round) {
  return el("div", { class: "card" }, [
    el("h2", {}, "Preview tools"),
    el("p", { class: "small" }, "Use these to see the lock, the results and the table without waiting for November. The scores they add are made up."),
    el("button", {
      class: "primary",
      type: "button",
      onClick: () => ctx.actions.simulate(round ? round.id : "R4"),
    }, `Pretend ${round ? round.name : "this round"} has kicked off`),
    el("button", { class: "secondary", type: "button", onClick: () => ctx.actions.clearSim() }, "Back to today"),
    el("button", { class: "ghost", type: "button", onClick: () => ctx.actions.resetPreview() }, "Reset this phone"),
  ]);
}

function pick(ctx) {
  const round = selectedRound(ctx);
  if (!round) return el("div", { class: "card" }, "No rounds are set up yet.");
  const locked = isLocked(round, ctx.bundle.now);
  const saved = myTeam(ctx, round.id);
  return el("div", {}, [
    roundChips(ctx),
    el("div", { class: "card" }, [
      el("h2", {}, round.name),
      el("p", {}, locked
        ? `Locked at ${formatWhen(round.lock_at)}. This team can't be changed.`
        : `You can change this until ${formatWhen(round.lock_at)}.`),
      saved && saved.updated_at ? el("p", { class: "small" }, `Last saved ${formatWhen(saved.updated_at)}.`) : null,
    ]),
    locked ? readOnlyTeam(ctx, round, saved) : pickForm(ctx, round),
    fixtureCard(ctx, round),
  ]);
}

function pickForm(ctx, round) {
  const draft = ctx.draft || { slots: {}, captain: "", supersub: "", predictions: {} };
  const idx = indexes(ctx);
  const check = validateTeam(
    { ...draft, captain: draft.captain || null, supersub: draft.supersub || null },
    { ...idx, rules: ctx.rules, fixtures: ctx.bundle.fixtures, roundId: round.id }
  );
  const chosen = new Set(Object.values(draft.slots).filter(Boolean));
  return el("div", {}, [
    el("div", { class: "card" }, [
      el("h2", {}, "Your 15"),
      el("p", { class: "small" }, `One player per position, max ${ctx.rules.max_per_nation} from any nation. OUT and doubt are marked. A captain scores double.`),
      countsLine(draft, idx, ctx.rules.max_per_nation),
      saveButton(ctx, check),
      Array.from({ length: 15 }, (_, i) => slotField(ctx, i + 1, draft, idx, chosen)),
      el("h3", {}, "Captain"),
      el("select", {
        id: "captain",
        value: draft.captain || "",
        onChange: (e) => ctx.actions.patchDraft((d) => { d.captain = e.target.value; }),
      }, [
        el("option", { value: "" }, "Choose your captain"),
        ...Object.entries(draft.slots).filter(([, id]) => id).map(([slot, id]) =>
          el("option", { value: id }, `${slot}. ${labelPlayer(idx.byId[id])}`)
        ),
      ]),
      el("h3", {}, "Supersub"),
      el("p", { class: "small" }, `Optional. One extra player who starts on the bench scores ×${ctx.rules.supersub.multiplier}. If they're named to start, they score ×${ctx.rules.supersub.if_starts_multiplier}. They count towards the nation limit and can't be in your 15.`),
      field("Find a player", el("input", {
        id: "finder",
        value: ctx.supersubQuery || "",
        placeholder: "Type a name",
        onInput: (e) => ctx.actions.setFinder(e.target.value),
      })),
      supersubSelect(ctx, draft, idx, chosen),
      check.errors.length ? el("div", { class: "err" }, check.errors.join(" ")) : null,
      check.warnings.length ? el("div", { class: "warn" }, check.warnings.join(" ")) : null,
      saveButton(ctx, check),
    ]),
    el("details", { class: "card" }, [
      el("summary", {}, "Predict the results (optional)"),
      el("p", { class: "small" }, "Correct winner 3. Margin in the right band (1–7, 8–14, 15+) adds 2. The exact margin adds 3 more. A correct draw scores 8."),
      ...ctx.bundle.fixtures.filter((f) => f.round_id === round.id).map((fixture) => predictionRow(ctx, draft, fixture)),
    ]),
  ]);
}

function saveButton(ctx, check) {
  return el("button", {
    class: "primary",
    type: "button",
    disabled: ctx.busy || !check.ok,
    onClick: () => ctx.actions.saveTeam(),
  }, ctx.busy ? "Saving…" : "Save team");
}

function slotField(ctx, n, draft, idx, chosen) {
  const current = draft.slots[String(n)] || "";
  const allowed = new Set(ctx.rules.slots[String(n)] || []);
  const counts = nationCounts(draft, idx.byId, String(n));
  const name = ctx.rules.slot_names[n - 1];
  const notes = current ? lineupNotes(current, ctx.roundId, { ...idx, fixtures: ctx.bundle.fixtures, lineups: ctx.bundle.lineups }) : [];
  return el("div", { class: "slot" }, [
    el("label", { htmlFor: `s${n}` }, [el("span", { class: "num" }, String(n)), name]),
    el("select", {
      id: `s${n}`,
      value: current,
      onChange: (e) => ctx.actions.patchDraft((d) => { d.slots[String(n)] = e.target.value; }),
    }, playerOptions(idx, allowed, current, counts, chosen, ctx.rules.max_per_nation, "")),
    notes.length ? el("p", { class: "small tag" }, notes.join(". ")) : null,
  ]);
}

function supersubSelect(ctx, draft, idx, chosen) {
  const current = draft.supersub || "";
  const counts = nationCounts(draft, idx.byId, "supersub");
  const query = (ctx.supersubQuery || "").trim().toLowerCase();
  return el("select", {
    id: "supersub",
    value: current,
    onChange: (e) => ctx.actions.patchDraft((d) => { d.supersub = e.target.value; }),
  }, playerOptions(idx, null, current, counts, chosen, ctx.rules.max_per_nation, query));
}

function playerOptions(idx, allowed, current, counts, chosen, max, query) {
  const options = [el("option", { value: "" }, "Choose")];
  for (const union of idx.unions) {
    let players = idx.squad.filter((p) => p.union_code === union.code);
    if (allowed) players = players.filter((p) => allowed.has(p.position_group));
    if (query) players = players.filter((p) => p.name.toLowerCase().includes(query) || p.id === current);
    if (!players.length) continue;
    options.push(el("optgroup", { label: union.name }, players.map((player) => {
      const blocked = player.id !== current && (chosen.has(player.id) || (counts[player.union_code] || 0) >= max);
      return el("option", { value: player.id, disabled: blocked }, optionText(player));
    })));
  }
  if (current && !options.some((node) => node.value === current || [...node.children].some((child) => child.value === current))) {
    options.push(el("option", { value: current }, current));
  }
  return options;
}

function predictionRow(ctx, draft, fixture) {
  const pick = (draft.predictions || {})[fixture.id] || {};
  const set = (key, value) => ctx.actions.patchDraft((d) => {
    d.predictions = d.predictions || {};
    const next = { ...(d.predictions[fixture.id] || {}) };
    if (!value) delete next[key];
    else next[key] = key === "margin" ? Number(value) : value;
    if (key === "winner" && value === "Draw") delete next.margin;
    if (Object.keys(next).length) d.predictions[fixture.id] = next;
    else delete d.predictions[fixture.id];
  });
  return el("div", { class: "slot" }, [
    el("b", {}, `${fixture.home} v ${fixture.away}`),
    el("p", { class: "small" }, `${formatWhen(fixture.kickoff_at)} · ${fixture.venue || ""}`),
    el("div", { class: "row2" }, [
      el("select", {
        value: pick.winner || "",
        onChange: (e) => set("winner", e.target.value),
      }, [
        el("option", { value: "" }, "Winner"),
        el("option", { value: fixture.home }, fixture.home),
        el("option", { value: fixture.away }, fixture.away),
        el("option", { value: "Draw" }, "Draw"),
      ]),
      pick.winner && pick.winner !== "Draw"
        ? el("select", {
            value: pick.margin ? String(pick.margin) : "",
            onChange: (e) => set("margin", e.target.value),
          }, [el("option", { value: "" }, "Margin"), ...Array.from({ length: 60 }, (_, i) => el("option", { value: String(i + 1) }, String(i + 1)))])
        : null,
    ]),
  ]);
}

function scores(ctx) {
  const round = selectedRound(ctx);
  if (!round) return el("div", { class: "card" }, "No rounds yet.");
  const locked = isLocked(round, ctx.bundle.now);
  const sample = Object.values(ctx.bundle.results).some((r) => r.sample);
  return el("div", {}, [
    roundChips(ctx),
    sample ? el("div", { class: "banner" }, [el("strong", {}, "Made-up scores"), "These results are only here so the preview can show the table. They are not real."]) : null,
    locked ? null : el("div", { class: "card" }, [
      el("h2", {}, "Hidden until lock"),
      el("p", {}, `Other teams stay hidden until ${formatWhen(round.lock_at)}.`),
    ]),
    ...peopleForRound(ctx, round, locked).map((person) => personCard(ctx, round, person)),
    fixtureCard(ctx, round, true),
  ]);
}

function personCard(ctx, round, person) {
  if (!person.team) {
    return el("div", { class: "card" }, [
      el("h2", {}, person.name),
      el("p", {}, "No team saved."),
    ]);
  }
  const scored = scoreTeam(person.team, round.id, scoreContext(ctx));
  const idx = indexes(ctx);
  const showPoints = isLocked(round, ctx.bundle.now);
  return el("div", { class: "card" }, [
    el("h2", {}, showPoints ? `${person.name} · ${fmtPts(scored.total)}` : person.name),
    el("table", {}, [
      el("tbody", {}, [
        ...scored.slots.sort((a, b) => Number(a.slot) - Number(b.slot)).map((row) =>
          el("tr", {}, [
            el("td", {}, `${row.slot}. ${playerLabel(row.playerId, idx)}${row.captain ? " (c)" : ""}`),
            el("td", { class: "pts" }, showPoints ? (row.captain ? `${fmtPts(row.raw)} ×2 = ${fmtPts(row.points)}` : fmtPts(row.points)) : ""),
          ])
        ),
        missingSlots(person.team).map((n) => el("tr", {}, [el("td", {}, `${n}. Not picked`), el("td", {})])),
        person.team.supersub
          ? el("tr", {}, [
              el("td", {}, `Supersub ${playerLabel(person.team.supersub, idx)}`),
              el("td", { class: "pts" }, showPoints ? fmtPts(scored.supersub ? scored.supersub.points : 0) : ""),
            ])
          : null,
      ]),
    ]),
    showPoints && scored.predictions.length
      ? el("p", {}, `Predictions ${fmtPts(scored.predictionPoints)}`)
      : null,
    showPoints ? el("p", { class: "small" }, partSummary(scored)) : null,
  ]);
}

function partSummary(scored) {
  const bits = [];
  for (const row of scored.slots) {
    for (const match of row.matches) {
      if (match.parts.length) bits.push(`${playerName(row.playerId)}: ${match.parts.map((p) => p.label).join(", ")}`);
    }
  }
  if (scored.supersub) {
    for (const match of scored.supersub.matches) {
      const mult = match.started ? "started, half points" : "bench, triple points";
      bits.push(`Supersub ${playerName(scored.supersub.playerId)} (${mult})`);
    }
  }
  return bits.join(" · ");
}

function squads(ctx) {
  const idx = indexes(ctx);
  return el("div", {}, [
    el("div", { class: "card" }, [
      el("h2", {}, "Squads"),
      el("p", { class: "small" }, `As published by the unions, last compiled ${ctx.asof}. Only add a player after that union has named them.`),
    ]),
    ...idx.unions.map((union) => unionDetails(ctx, union, idx)),
  ]);
}

function unionDetails(ctx, union, idx) {
  const players = idx.squad.filter((p) => p.union_code === union.code);
  return el("details", { class: "card" }, [
    el("summary", {}, union.name),
    el("p", {}, el("b", {}, STATUS[union.status] || union.status || "")),
    union.note ? el("p", { class: "small" }, union.note) : null,
    union.source ? el("p", { class: "small" }, union.source) : null,
    ...GROUP_ORDER.map((group) => {
      const list = players.filter((p) => p.position_group === group);
      if (!list.length) return null;
      return el("p", {}, [
        el("b", {}, `${ctx.rules.position_groups[group] || group}: `),
        list.map((p) => optionText(p)).join(", "),
      ]);
    }),
  ]);
}

function rulesPage(ctx) {
  const pp = ctx.rules.player_points;
  const rows = [
    ["Try, forward", pp.try_forward],
    ["Try, back", pp.try_back],
    ["Conversion", pp.conversion],
    ["Penalty goal", pp.penalty_goal],
    ["Drop goal", pp.drop_goal],
    ["Metres carried", `${pp.metres_carried_per_10} per 10m`],
    ["Tackle", pp.tackle],
    ["Player of the Match", pp.player_of_the_match],
    ["Yellow card", pp.yellow_card],
    ["Red card", pp.red_card],
  ];
  return el("div", { class: "card" }, [
    el("h2", {}, "How scoring works"),
    el("ul", {}, [
      el("li", {}, "Pick a full 15, one player per position, plus a captain. Captain points count double."),
      el("li", {}, `Supersub is optional: a bench player scores ×${ctx.rules.supersub.multiplier}, or ×${ctx.rules.supersub.if_starts_multiplier} if he is named to start. He counts in the nation limit.`),
      el("li", {}, `Max ${ctx.rules.max_per_nation} players from any one nation.`),
      el("li", {}, "Players listed as position still to be confirmed can fill any forward slot, or any back slot, depending on which list they're on."),
      el("li", {}, "The whole team locks at the first kick-off of the round. Until then you can change it. Other people's teams stay hidden until that lock."),
      el("li", {}, "We only score stats that are published for the players after each match."),
    ]),
    el("table", {}, [
      el("tbody", {}, rows.map(([label, points]) => el("tr", {}, [el("td", {}, label), el("td", { class: "pts" }, String(points))]))),
    ]),
    el("h3", {}, "Predictions"),
    el("p", {}, "Correct winner 3, right margin band (1–7, 8–14, 15+) +2, exact margin +3 more. A correct draw scores 8. Predictions are optional."),
    el("button", { class: "secondary", type: "button", onClick: () => ctx.actions.go("home") }, "Back"),
  ]);
}

function adminPage(ctx) {
  if (!ctx.session.isAdmin) return el("div", { class: "card" }, "Only Richard can open this.");
  const tab = ctx.admin.tab;
  return el("div", {}, [
    el("div", { class: "chips" }, [
      ["matches", "Matches"],
      ["squads", "Squads"],
      ["family", "Family logins"],
      ["locks", "Lock times"],
    ].map(([id, label]) => el("button", {
      type: "button",
      "aria-current": tab === id ? "true" : "false",
      onClick: () => ctx.actions.setAdminTab(id),
    }, label))),
    tab === "matches" ? adminMatches(ctx) : null,
    tab === "squads" ? adminSquads(ctx) : null,
    tab === "family" ? adminFamily(ctx) : null,
    tab === "locks" ? adminLocks(ctx) : null,
  ]);
}

function adminMatches(ctx) {
  const fixtures = [...ctx.bundle.fixtures].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  const fixture = fixtures.find((f) => f.id === ctx.admin.fixtureId) || fixtures[0];
  const idx = indexes(ctx);
  const result = fixture && ctx.bundle.results[fixture.id];
  const stats = fixture ? ctx.bundle.stats[fixture.id] || {} : {};
  const pool = fixture ? playersForFixture(fixture, ctx, idx) : [];
  return el("div", { class: "card" }, [
    el("h2", {}, "Match scores"),
    el("p", { class: "small" }, "Enter the score, the matchday 23 and the published player stats. Points update from those numbers."),
    el("select", {
      value: fixture ? fixture.id : "",
      onChange: (e) => ctx.actions.setAdminFixture(e.target.value),
    }, fixtures.map((f) => el("option", { value: f.id }, `${f.home} v ${f.away}`))),
    fixture ? el("form", {
      onSubmit: (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        ctx.actions.saveResult(fixture.id, data.get("home"), data.get("away"));
      },
    }, [
      el("div", { class: "row2" }, [
        field(fixture.home, el("input", { name: "home", inputmode: "numeric", value: result ? result.home : "", required: true })),
        field(fixture.away, el("input", { name: "away", inputmode: "numeric", value: result ? result.away : "", required: true })),
      ]),
      el("button", { class: "primary", type: "submit" }, "Save score"),
      result ? el("button", { class: "ghost", type: "button", onClick: () => ctx.actions.deleteResult(fixture.id) }, "Remove score") : null,
    ]) : null,
    fixture ? el("div", {}, [
      el("h3", {}, "Player stats"),
      ...Object.entries(stats).map(([playerId, stat]) => el("div", { class: "person" }, [
        el("b", {}, playerLabel(playerId, idx)),
        el("p", { class: "small" }, statLine(stat)),
        el("button", { class: "ghost", type: "button", onClick: () => ctx.actions.deleteStat(fixture.id, playerId) }, "Remove"),
      ])),
      el("form", {
        onSubmit: (e) => {
          e.preventDefault();
          const data = new FormData(e.target);
          ctx.actions.saveStat(fixture.id, {
            player_id: data.get("player"),
            started: data.get("started") === "on",
            tries: data.get("tries"),
            conversions: data.get("conversions"),
            penalty_goals: data.get("penalty_goals"),
            drop_goals: data.get("drop_goals"),
            metres_carried: data.get("metres"),
            tackles: data.get("tackles"),
            potm: data.get("potm") === "on",
            yellow: data.get("yellow"),
            red: data.get("red"),
          });
        },
      }, [
        field("Player", el("select", { name: "player", required: true }, [
          el("option", { value: "" }, "Choose"),
          ...pool.map((p) => el("option", { value: p.id }, `${p.name} (${idx.unionName[p.union_code]})`)),
        ])),
        el("label", { class: "small" }, [el("input", { type: "checkbox", name: "started" }), " Started"]),
        el("label", { class: "small" }, [el("input", { type: "checkbox", name: "potm" }), " Player of the Match"]),
        numberPair("Tries", "tries", "Conversions", "conversions"),
        numberPair("Penalty goals", "penalty_goals", "Drop goals", "drop_goals"),
        numberPair("Metres", "metres", "Tackles", "tackles"),
        numberPair("Yellow", "yellow", "Red", "red"),
        el("button", { class: "secondary", type: "submit" }, "Save this player"),
      ]),
      el("h3", {}, "Matchday 23"),
      el("p", { class: "small" }, "One name per line, spelled as in the squad list. This only flags picks. It doesn't score points by itself."),
      lineupForm(ctx, fixture, "home", fixture.home),
      lineupForm(ctx, fixture, "away", fixture.away),
      el("h3", {}, "Or paste a match"),
      el("p", { class: "small" }, "Example of the shape, not a real result."),
      el("pre", { class: "sample" }, exampleJson()),
      el("form", {
        onSubmit: (e) => {
          e.preventDefault();
          ctx.actions.importMatch(fixture.id, new FormData(e.target).get("json"));
        },
      }, [
        el("textarea", { name: "json", placeholder: "{ }" }),
        el("button", { class: "secondary", type: "submit" }, "Import"),
      ]),
    ]) : null,
    fixture ? el("form", {
      onSubmit: (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        ctx.actions.saveFixture(fixture.id, {
          home: data.get("home"),
          away: data.get("away"),
          venue: data.get("venue"),
          kickoff_at: data.get("kickoff"),
        });
      },
    }, [
      el("h3", {}, "Teams and kick-off"),
      el("p", { class: "small" }, "Finals weekend starts as pool places. Replace them when the unions confirm the match-ups. Times are UK, which is GMT for this competition."),
      field("Home", el("input", { name: "home", value: fixture.home })),
      field("Away", el("input", { name: "away", value: fixture.away })),
      field("Venue", el("input", { name: "venue", value: fixture.venue || "" })),
      field("Kick-off", el("input", { name: "kickoff", type: "datetime-local", value: inputValue(fixture.kickoff_at) })),
      el("button", { class: "secondary", type: "submit" }, "Save match"),
    ]) : null,
  ]);
}

function lineupForm(ctx, fixture, side, title) {
  const lineup = ((ctx.bundle.lineups || {})[fixture.id] || {})[side] || { starting: [], bench: [] };
  return el("form", {
    onSubmit: (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      ctx.actions.saveLineup(fixture.id, side, data.get("starting"), data.get("bench"));
    },
  }, [
    el("h3", {}, title),
    field("Starting 15", el("textarea", { name: "starting", value: (lineup.starting || []).join("\n") })),
    field("Bench", el("textarea", { name: "bench", value: (lineup.bench || []).join("\n") })),
    el("button", { class: "secondary", type: "submit" }, "Save team sheet"),
  ]);
}

function adminSquads(ctx) {
  const idx = indexes(ctx);
  const union = idx.unions.find((u) => u.code === ctx.admin.union) || idx.unions[0];
  const players = idx.squad.filter((p) => p.union_code === union.code);
  return el("div", { class: "card" }, [
    el("h2", {}, "Squads"),
    el("p", { class: "small" }, "Change this only from an official union announcement. Type the name exactly as they published it."),
    el("select", {
      value: union.code,
      onChange: (e) => ctx.actions.setAdminUnion(e.target.value),
    }, idx.unions.map((u) => el("option", { value: u.code }, u.name))),
    el("form", {
      onSubmit: (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        ctx.actions.saveUnion(union.code, {
          status: data.get("status"),
          note: data.get("note"),
          source: data.get("source"),
        });
      },
    }, [
      field("Status", el("input", { name: "status", value: union.status || "" })),
      field("Note", el("textarea", { name: "note", value: union.note || "" })),
      field("Link to the announcement", el("input", { name: "source", value: union.source || "" })),
      el("button", { class: "secondary", type: "submit" }, "Save squad note"),
    ]),
    ...players.map((player) => el("div", { class: "person" }, [
      el("b", {}, player.name),
      el("p", { class: "small" }, ctx.rules.position_groups[player.position_group] || player.position_group),
      el("select", {
        value: player.availability,
        onChange: (e) => ctx.actions.savePlayer({ ...player, availability: e.target.value }),
      }, ["Squad", "Doubt", "Out"].map((status) => el("option", { value: status }, status))),
      el("button", { class: "ghost", type: "button", onClick: () => ctx.actions.deletePlayer(player.id) }, "Remove"),
    ])),
    el("h3", {}, "Add a named player"),
    el("form", {
      onSubmit: (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        ctx.actions.savePlayer({
          union_code: union.code,
          name: String(data.get("name") || "").trim(),
          position_group: data.get("group"),
          availability: data.get("availability"),
          note: data.get("note"),
        });
        e.target.reset();
      },
    }, [
      field("Name", el("input", { name: "name", required: true })),
      field("Position", el("select", { name: "group" }, GROUP_ORDER.map((g) =>
        el("option", { value: g }, ctx.rules.position_groups[g] || g)
      ))),
      field("Availability", el("select", { name: "availability" }, ["Squad", "Doubt", "Out"].map((s) => el("option", { value: s }, s)))),
      field("Note", el("input", { name: "note" })),
      el("button", { class: "primary", type: "submit" }, "Add player"),
    ]),
  ]);
}

function adminFamily(ctx) {
  if (ctx.mode === "preview") {
    return el("div", { class: "card" }, [
      el("h2", {}, "Family logins"),
      el("p", {}, "In the real league, invite Richard first, then Sharon, Brooke and Cameron. Richard's name is attached to the first invite. He then matches each email to a name on this screen."),
      el("p", { class: "small" }, "The preview has no email addresses."),
    ]);
  }
  const accounts = ctx.admin.accounts;
  return el("div", { class: "card" }, [
    el("h2", {}, "Family logins"),
    el("p", { class: "small" }, "Only you can see these email addresses. Match each one to Sharon, Brooke or Cameron. Richard is the first invite and stays the admin."),
    !accounts
      ? el("button", { class: "primary", type: "button", onClick: () => ctx.actions.loadAccounts() }, "Show logins")
      : accounts.map((account) => el("form", {
          class: "person",
          onSubmit: (e) => {
            e.preventDefault();
            const name = new FormData(e.target).get("name");
            if (name) ctx.actions.assign(account.id, name);
          },
        }, [
          el("b", {}, account.email || "No email"),
          el("p", { class: "small" }, account.display_name ? `Matched to ${account.display_name}` : "Not named yet"),
          account.display_name === "Richard"
            ? el("p", {}, "League admin")
            : el("div", {}, [
                el("select", { name: "name" }, [
                  el("option", { value: "" }, "Choose a name"),
                  ...["Sharon", "Brooke", "Cameron"].map((name) => el("option", { value: name }, name)),
                ]),
                el("button", { class: "secondary", type: "submit" }, "Save name"),
              ]),
        ])),
  ]);
}

function adminLocks(ctx) {
  return el("div", { class: "card" }, [
    el("h2", {}, "Lock times"),
    el("p", { class: "small" }, "Each round locks at its first kick-off. Change one only if the kick-off itself changes. Times are UK, which is GMT in November."),
    ...ctx.bundle.rounds.map((round) => el("form", {
      onSubmit: (e) => {
        e.preventDefault();
        ctx.actions.saveRound(round.id, new FormData(e.target).get("lock"));
      },
    }, [
      field(round.name, el("input", { type: "datetime-local", name: "lock", value: inputValue(round.lock_at) })),
      el("button", { class: "secondary", type: "submit" }, "Save lock time"),
    ])),
  ]);
}

function boardTable(ctx, board) {
  return el("table", {}, [
    el("thead", {}, el("tr", {}, [
      el("th", {}, "#"),
      el("th", {}, "Player"),
      el("th", { class: "pts" }, "Total"),
    ])),
    el("tbody", {}, board.map((row, i) => el("tr", { class: row.name === ctx.session.displayName ? "me" : "" }, [
      el("td", {}, String(i + 1)),
      el("td", { class: "board-name" }, row.name),
      el("td", { class: "pts" }, fmtPts(row.points)),
    ]))),
  ]);
}

function fixtureCard(ctx, round, withScores) {
  const fixtures = ctx.bundle.fixtures.filter((f) => f.round_id === round.id);
  return el("div", { class: "card" }, [
    el("h2", {}, `${round.name} matches`),
    el("table", {}, el("tbody", {}, fixtures.map((f) => {
      const result = ctx.bundle.results[f.id];
      return el("tr", {}, [
        el("td", {}, [
          el("b", {}, `${f.home} v ${f.away}`),
          el("br"),
          el("span", { class: "small" }, `${formatWhen(f.kickoff_at)}${f.venue ? ` · ${f.venue}` : ""}`),
        ]),
        withScores ? el("td", { class: "pts" }, result ? `${result.home}–${result.away}` : "") : null,
      ]);
    }))),
  ]);
}

function roundChips(ctx) {
  return el("div", { class: "chips" }, ctx.bundle.rounds.map((round) =>
    el("button", {
      type: "button",
      "aria-current": round.id === ctx.roundId ? "true" : "false",
      onClick: () => ctx.actions.setRound(round.id),
    }, round.id === "F" ? "Finals" : round.id)
  ));
}

function readOnlyTeam(ctx, round, team) {
  if (!team) return el("div", { class: "card" }, "No team was saved before lock.");
  return personCard(ctx, round, { name: ctx.session.displayName, team });
}

function selectedRound(ctx) {
  return ctx.bundle.rounds.find((r) => r.id === ctx.roundId) || ctx.bundle.rounds[0];
}

function myTeam(ctx, roundId) {
  if (!roundId) return null;
  return ctx.bundle.teams.find((t) => t.user_id === ctx.session.id && t.round_id === roundId) || null;
}

function season(ctx) {
  const locked = new Set(ctx.bundle.rounds.filter((r) => isLocked(r, ctx.bundle.now)).map((r) => r.id));
  const entries = ctx.managers.map((name) => ({
    name,
    teams: Object.fromEntries(
      ctx.bundle.teams.filter((t) => t.display_name === name && locked.has(t.round_id)).map((t) => [t.round_id, t])
    ),
  }));
  return seasonBoard(entries, scoreContext(ctx));
}

function peopleForRound(ctx, round, locked) {
  const names = locked ? ctx.managers : [ctx.session.displayName];
  const rows = names.map((name) => ({
    name,
    team: ctx.bundle.teams.find((t) => t.display_name === name && t.round_id === round.id) || null,
  }));
  if (!locked) return rows;
  return rows.sort((a, b) => {
    const score = (row) => (row.team ? scoreTeam(row.team, round.id, scoreContext(ctx)).total : -1);
    return score(b) - score(a);
  });
}

function teamStatus(mine, locked) {
  if (mine && locked) return "Your team for this round is saved and locked.";
  if (mine) return "Your team for this round is saved. You can still change it until lock.";
  if (locked) return "No team was saved before lock.";
  return "You haven't saved a team for this round yet.";
}

function scoreContext(ctx) {
  const idx = indexes(ctx);
  return {
    rules: ctx.rules,
    fixtures: ctx.bundle.fixtures,
    resultsById: ctx.bundle.results,
    statsByFixture: ctx.bundle.stats,
    groupOf: (id) => idx.byId[id]?.position_group || "",
  };
}

function indexes(ctx) {
  const byId = Object.fromEntries(ctx.bundle.squad.map((p) => [p.id, p]));
  const unions = sortUnions(ctx.bundle.unions);
  const unionName = Object.fromEntries(unions.map((u) => [u.code, u.name]));
  const unionByName = Object.fromEntries(unions.map((u) => [u.name, u.code]));
  return { byId, unions, unionName, unionByName, squad: ctx.bundle.squad };
}

function nationCounts(draft, byId, except) {
  const counts = {};
  for (let n = 1; n <= 15; n++) {
    if (String(n) === String(except)) continue;
    const player = byId[draft.slots[String(n)]];
    if (!player) continue;
    counts[player.union_code] = (counts[player.union_code] || 0) + 1;
  }
  if (except !== "supersub" && draft.supersub && byId[draft.supersub]) {
    const code = byId[draft.supersub].union_code;
    counts[code] = (counts[code] || 0) + 1;
  }
  return counts;
}

function countsLine(draft, idx, max) {
  const counts = nationCounts({ ...draft, supersub: draft.supersub }, idx.byId, null);
  const bits = Object.entries(counts).map(([code, n]) => `${idx.unionName[code] || code} ${n}`);
  return el("p", { class: "small" }, bits.length ? `Nations: ${bits.join(", ")} (max ${max})` : "No players yet.");
}

function optionText(player) {
  if (!player) return "";
  if (player.availability === "Out") return `${player.name} – OUT`;
  if (player.availability === "Doubt") return `${player.name} – doubt`;
  return player.name;
}

function labelPlayer(player) {
  return player ? optionText(player) : "";
}

function playerLabel(id, idx) {
  const player = idx.byId[id];
  if (!player) return id;
  return `${player.name} (${idx.unionName[player.union_code] || player.union_code})`;
}

function missingSlots(team) {
  const missing = [];
  for (let n = 1; n <= 15; n++) if (!team.slots || !team.slots[String(n)]) missing.push(n);
  return missing;
}

function playersForFixture(fixture, ctx, idx) {
  const codes = [idx.unionByName[fixture.home], idx.unionByName[fixture.away]].filter(Boolean);
  const pool = codes.length ? ctx.bundle.squad.filter((p) => codes.includes(p.union_code)) : ctx.bundle.squad;
  return [...pool].sort((a, b) => a.name.localeCompare(b.name));
}

function field(label, control) {
  return el("div", { class: "field" }, [el("label", {}, label), control]);
}

function numberPair(aLabel, aName, bLabel, bName) {
  return el("div", { class: "row2" }, [
    field(aLabel, el("input", { name: aName, inputmode: "numeric", value: "0" })),
    field(bLabel, el("input", { name: bName, inputmode: "numeric", value: "0" })),
  ]);
}

function statLine(stat) {
  return [
    stat.started ? "started" : "bench",
    `${stat.tries || 0} tries`,
    `${stat.tackles || 0} tackles`,
    `${stat.metres_carried || 0}m`,
    stat.potm ? "POTM" : "",
  ].filter(Boolean).join(" · ");
}

function exampleJson() {
  return `{
  "home": 24,
  "away": 17,
  "stats": {
    "IRE:Dan Sheehan": {
      "started": true,
      "tries": 1,
      "conversions": 0,
      "penalty_goals": 0,
      "drop_goals": 0,
      "metres_carried": 34,
      "tackles": 8,
      "potm": false,
      "yellow": 0,
      "red": 0
    }
  }
}`;
}
