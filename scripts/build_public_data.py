#!/usr/bin/env python3
"""Build the public squad/fixture files from a league.json export.

Drops private notes, saved picks and test teams. Nothing in the output is an
account, a password, or a real person's team.

Usage: python3 scripts/build_public_data.py path/to/league.json
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLOT_NAMES = [
    "Loosehead prop",
    "Hooker",
    "Tighthead prop",
    "Lock",
    "Lock",
    "Blindside flanker",
    "Openside flanker",
    "Number 8",
    "Scrum-half",
    "Fly-half",
    "Left wing",
    "Inside centre",
    "Outside centre",
    "Right wing",
    "Full-back",
]
ROUND_ORDER = ["R4", "R5", "R6", "F"]
# A real test team that must never be written out as league data.
FORBIDDEN = {
    "WAL:Rhys Carre",
    "IRE:Dan Sheehan",
    "AUS:Allan Alaalatoa",
    "ENG:Ollie Chessum",
    "IRE:Tadhg Beirne",
    "ENG:Ben Earl",
    "NZL:Leicester Fainga'anuku",
    "WAL:Jac Morgan",
    "FRA:Antoine Dupont",
    "NZL:Richie Mo'unga",
    "IRE:Rob Baloucoune",
    "SCO:Huw Jones",
    "FRA:Nicolas Depoortere",
    "FRA:Louis Bielle-Biarrey",
    "NZL:Will Jordan",
}


def q(value):
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def iso(date_s, time_s):
    return f"{date_s}T{time_s}:00Z"


def build_team(squads, slots, max_per, offset):
    codes = [c for c in squads if squads[c]["players"]]
    codes = codes[offset % len(codes):] + codes[: offset % len(codes)]
    chosen = {}
    counts = {}
    used = set()
    for n in range(1, 16):
        allowed = set(slots[str(n)])
        pick = None
        for code in codes:
            if counts.get(code, 0) >= max_per:
                continue
            pool = [
                p
                for p in squads[code]["players"]
                if p["group"] in allowed
                and p["status"] != "Out"
                and f"{code}:{p['name']}" not in used
            ]
            if not pool:
                continue
            player = pool[(offset + n) % len(pool)]
            pick = f"{code}:{player['name']}"
            used.add(pick)
            counts[code] = counts.get(code, 0) + 1
            break
        if not pick:
            raise SystemExit(f"Could not fill slot {n} for offset {offset}")
        chosen[str(n)] = pick
    supersub = None
    for code in reversed(codes):
        if counts.get(code, 0) >= max_per:
            continue
        pool = [
            p
            for p in squads[code]["players"]
            if p["group"] in {"SH", "FH", "CE", "B3", "BX"}
            and p["status"] != "Out"
            and f"{code}:{p['name']}" not in used
        ]
        if pool:
            player = pool[offset % len(pool)]
            supersub = f"{code}:{player['name']}"
            break
    if not supersub:
        raise SystemExit(f"Could not pick a supersub for offset {offset}")
    return {
        "slots": chosen,
        "captain": chosen["10"],
        "supersub": supersub,
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/build_public_data.py path/to/league.json")
    src = json.loads(Path(sys.argv[1]).read_text())
    rules = dict(src["rules"])
    rules["slot_names"] = SLOT_NAMES
    rules["position_groups"] = src["position_groups"]
    rounds = []
    for i, rid in enumerate(ROUND_ORDER):
        meta = src["rounds"][rid]
        date_s, time_s = meta["deadline_uk"].split(" ")
        rounds.append(
            {
                "id": rid,
                "name": meta["name"],
                "lock_at": iso(date_s, time_s),
                "note": meta.get("note"),
                "sort_order": i + 1,
            }
        )
    fixtures = []
    for f in src["fixtures"]:
        fixtures.append(
            {
                "id": f["id"],
                "round_id": f["round"],
                "kickoff_at": iso(f["date"], f["kickoff_uk"]),
                "home": f["home"],
                "away": f["away"],
                "venue": f["venue"],
                "status": f["status"],
                "expected_announcement": f.get("expected_team_announcement"),
            }
        )
    unions = []
    squad = []
    for code, s in src["squads"].items():
        unions.append(
            {
                "code": code,
                "name": s["team"],
                "status": s["status"],
                "announced_on": s.get("announced"),
                "note": s.get("note") or "",
                "source": s.get("source") or "",
            }
        )
        for p in s["players"]:
            squad.append(
                {
                    "id": f"{code}:{p['name']}",
                    "union_code": code,
                    "name": p["name"],
                    "position_group": p["group"],
                    "availability": p["status"],
                    "note": p.get("note") or "",
                }
            )
    public = {
        "league": src["league"],
        "asof": src["updated"],
        "timezone": "Europe/London",
        "managers": src["players"],
        "admin": "Richard",
        "rules": rules,
        "rounds": rounds,
        "fixtures": fixtures,
        "unions": unions,
        "squad": squad,
    }
    dropped = [
        "picks",
        "fantasy_teams",
        "leaderboard",
        "_private",
        "picks_collection",
        "history",
        "canvas",
    ]
    blob = json.dumps(public)
    for key in dropped:
        if f'"{key}"' in blob:
            raise SystemExit(f"Refusing to write private field {key}")
    if "@" in blob:
        raise SystemExit("Refusing to write a file that contains an email address")

    demo_teams = {}
    for name, offset in (("Sharon", 1), ("Brooke", 4), ("Cameron", 7)):
        team = build_team(src["squads"], rules["slots"], rules["max_per_nation"], offset)
        if set(team["slots"].values()) == FORBIDDEN:
            raise SystemExit(f"Sample team for {name} matches a real test pick")
        preds = {}
        r4 = [f for f in fixtures if f["round_id"] == "R4"]
        for i, f in enumerate(r4):
            preds[f["id"]] = {
                "winner": f["away"] if (i + offset) % 2 == 0 else f["home"],
                "margin": 3 + offset + i,
            }
        team["predictions"] = preds
        demo_teams[name] = team

    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "public.json").write_text(json.dumps(public, ensure_ascii=False, indent=2) + "\n")
    (data_dir / "demo-seed.json").write_text(
        json.dumps(
            {
                "note": "Invented teams for the on-phone preview. Not anyone's real picks.",
                "teams": demo_teams,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )

    lines = [
        "-- Public squad and fixture data for Watson Family Fantasy Rugby.",
        "-- No accounts, no passwords, and no saved teams.",
        "-- Paste this whole file into the Supabase SQL editor after the schema, then press Run.",
        "begin;",
        "insert into public.league_settings (id, max_per_nation, captain_multiplier, supersub_multiplier, supersub_if_starts_multiplier)",
        f"values (1, {int(rules['max_per_nation'])}, {rules['captain_multiplier']}, {rules['supersub']['multiplier']}, {rules['supersub']['if_starts_multiplier']})",
        "on conflict (id) do update set",
        "  max_per_nation = excluded.max_per_nation,",
        "  captain_multiplier = excluded.captain_multiplier,",
        "  supersub_multiplier = excluded.supersub_multiplier,",
        "  supersub_if_starts_multiplier = excluded.supersub_if_starts_multiplier;",
    ]
    for slot, groups in rules["slots"].items():
        arr = "array[" + ", ".join(q(g) for g in groups) + "]"
        lines.append(
            "insert into public.slot_groups (slot, groups) values ("
            + q(slot)
            + ", "
            + arr
            + ") on conflict (slot) do update set groups = excluded.groups;"
        )
    for r in rounds:
        lines.append(
            "insert into public.rounds (id, name, lock_at, note, sort_order) values ("
            + ", ".join([q(r["id"]), q(r["name"]), q(r["lock_at"]), q(r["note"]), str(r["sort_order"])])
            + ") on conflict (id) do update set name = excluded.name, lock_at = excluded.lock_at, note = excluded.note, sort_order = excluded.sort_order;"
        )
    for f in fixtures:
        lines.append(
            "insert into public.fixtures (id, round_id, kickoff_at, home, away, venue, status, expected_announcement) values ("
            + ", ".join(
                [
                    q(f["id"]),
                    q(f["round_id"]),
                    q(f["kickoff_at"]),
                    q(f["home"]),
                    q(f["away"]),
                    q(f["venue"]),
                    q(f["status"]),
                    q(f["expected_announcement"]),
                ]
            )
            + ") on conflict (id) do update set round_id = excluded.round_id, kickoff_at = excluded.kickoff_at, home = excluded.home, away = excluded.away, venue = excluded.venue, status = excluded.status, expected_announcement = excluded.expected_announcement;"
        )
        for side in ("home", "away"):
            lines.append(
                "insert into public.lineups (fixture_id, side, starting, bench) values ("
                + q(f["id"])
                + ", "
                + q(side)
                + ", '[]'::jsonb, '[]'::jsonb) on conflict (fixture_id, side) do nothing;"
            )
    for u in unions:
        lines.append(
            "insert into public.unions (code, name, status, announced_on, note, source) values ("
            + ", ".join(
                [
                    q(u["code"]),
                    q(u["name"]),
                    q(u["status"]),
                    q(u["announced_on"]),
                    q(u["note"]),
                    q(u["source"]),
                ]
            )
            + ") on conflict (code) do update set name = excluded.name, status = excluded.status, announced_on = excluded.announced_on, note = excluded.note, source = excluded.source;"
        )
    for p in squad:
        lines.append(
            "insert into public.players (id, union_code, name, position_group, availability, note) values ("
            + ", ".join(
                [
                    q(p["id"]),
                    q(p["union_code"]),
                    q(p["name"]),
                    q(p["position_group"]),
                    q(p["availability"]),
                    q(p["note"]),
                ]
            )
            + ") on conflict (id) do update set union_code = excluded.union_code, name = excluded.name, position_group = excluded.position_group, availability = excluded.availability, note = excluded.note;"
        )
    lines.append("commit;")
    (ROOT / "supabase" / "seed.sql").write_text("\n".join(lines) + "\n")
    print(f"unions {len(unions)} players {len(squad)} fixtures {len(fixtures)} demo {list(demo_teams)}")


if __name__ == "__main__":
    main()
