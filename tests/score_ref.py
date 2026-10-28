"""Reference scorer. Keep this in step with js/score.js and the original league sums."""

FORWARD = {"PR", "HK", "LK", "BR", "FX"}


def num(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    if number != number:
        return 0
    return number


def band(margin, bands):
    margin = num(margin)
    for i, (lo, hi) in enumerate(bands):
        if lo <= margin <= hi:
            return i
    return -1


def player_points(stats, group, rules):
    if not stats:
        return 0
    pp = rules["player_points"]
    points = (pp["try_forward"] if group in FORWARD else pp["try_back"]) * num(stats.get("tries"))
    points += pp["conversion"] * num(stats.get("conversions"))
    penalties = stats.get("penalty_goals") if stats.get("penalty_goals") is not None else stats.get("penalties")
    points += pp["penalty_goal"] * num(penalties)
    points += pp["drop_goal"] * num(stats.get("drop_goals"))
    points += pp["metres_carried_per_10"] * (int(num(stats.get("metres_carried"))) // 10)
    points += pp["tackle"] * num(stats.get("tackles"))
    if stats.get("potm"):
        points += pp["player_of_the_match"]
    points += pp["yellow_card"] * num(stats.get("yellow"))
    points += pp["red_card"] * num(stats.get("red"))
    return points


def prediction_points(fixture, pick, result, rules):
    if not pick or not result or not pick.get("winner"):
        return 0, 0
    home, away = num(result["home"]), num(result["away"])
    actual = "Draw" if home == away else (fixture["home"] if home > away else fixture["away"])
    actual_margin = abs(home - away)
    bonus = rules["prediction_bonus"]
    if pick.get("winner") == "Draw":
        return (8, 0) if actual == "Draw" else (0, 0)
    if pick.get("winner") != actual:
        return 0, 0
    points = bonus["winner_points"]
    picked = num(pick.get("margin"))
    if band(picked, bonus["margin_bands"]) == band(actual_margin, bonus["margin_bands"]):
        points += bonus["margin_band_points"]
    if picked == actual_margin:
        points += bonus["exact_margin_points"]
    return points, 1


def score_team(team, round_id, ctx):
    rules = ctx["rules"]
    fixtures = [f for f in ctx["fixtures"] if f.get("round_id", f.get("round")) == round_id]
    fantasy = 0
    for player_id in (team.get("slots") or {}).values():
        if not player_id:
            continue
        raw = 0
        for fixture in fixtures:
            raw += player_points((ctx["stats"].get(fixture["id"]) or {}).get(player_id), ctx["groups"].get(player_id, ""), rules)
        mult = rules.get("captain_multiplier", 2) if player_id == team.get("captain") else 1
        fantasy += raw * mult
    supersub = team.get("supersub")
    if supersub:
        for fixture in fixtures:
            stats = (ctx["stats"].get(fixture["id"]) or {}).get(supersub)
            if not stats:
                continue
            base = player_points(stats, ctx["groups"].get(supersub, ""), rules)
            mult = rules["supersub"]["if_starts_multiplier"] if stats.get("started") else rules["supersub"]["multiplier"]
            fantasy += base * mult
    prediction = 0
    winners = 0
    for fixture in fixtures:
        result = ctx["results"].get(fixture["id"])
        if not result:
            continue
        got, win = prediction_points(fixture, (team.get("predictions") or {}).get(fixture["id"]), result, rules)
        prediction += got
        winners += win
    return {
        "fantasy": fantasy,
        "prediction": prediction,
        "total": fantasy + prediction,
        "correctWinners": winners,
    }
