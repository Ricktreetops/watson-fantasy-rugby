# Watson Family Fantasy Rugby

A phone-friendly league for Richard, Sharon, Brooke and Cameron. Nations Championship 2026.

Each person logs in, picks a 15 and a captain for the round, and can change it until the first kick-off. After that the teams lock, the points are added up, and the table updates. Other people's picks stay hidden until lock.

The page is static. Logins and saved teams sit in a free Supabase project. Passwords are never stored in this repository.

## Preview on your computer

No account is required for the preview. It keeps picks on that phone only.

```bash
python3 -m http.server 8080
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

1. Continue as Richard and save a team.
2. Log out, continue as Sharon, and open Scores. Richard's team is hidden.
3. Back as Richard, tap **Pretend Round 4 has kicked off**.
4. Scores and the table show all four players. The scores are made up. The team is locked.

## Switch on the real league

Follow [SETUP.md](SETUP.md) once: create the free project, paste two SQL files, invite the four players, and put the public project URL and public key in `config.js`.

`picks.json` is the old record of teams sent by message. The site does not load it.

## Checks

```bash
npm test
```
