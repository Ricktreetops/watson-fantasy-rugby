# Switch on Watson Family Fantasy Rugby

The page can stay on GitHub Pages. Logins and saved teams need a database, so this uses [Supabase](https://supabase.com), which has a free plan. One free project covers the logins and the saved teams. You do this once. Nobody types a password into a file.

Until the two public values are pasted into `config.js`, the site stays a **preview on that phone**. Picks in the preview are not shared.

Do the steps in order.

## 1. Create the free project

1. Go to [https://supabase.com](https://supabase.com) and create an account.
2. Click **New project**.
3. Name it `watson-fantasy-rugby`. Choose a database password and store it in your password manager. You will not paste that password into this website.
4. Wait until the project status is healthy.

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Open `supabase/migrations/001_schema.sql` from this project, select the whole file, paste it into the query, and press **Run**.
3. Open a new query. Paste the whole of `supabase/seed.sql` and press **Run**.

That second file is the squads and the fixtures. It has no accounts and no teams.

If Run reports an error you don't understand, don't keep clicking Run. The message is enough to fix the step that failed.

## 3. Turn off public sign-up

1. Open **Authentication** → **Sign In / Providers** (it may be labelled **Providers**).
2. Email should be on.
3. Find **Allow new users to sign up** and switch it **off**. Invites still work.
4. Find **Allow anonymous sign-ins** and switch that **off** too.
5. If you see a minimum password length, set it to **8**.

## 4. Tell Supabase where the site lives

1. Open **Authentication** → **URL Configuration**.
2. Set **Site URL** to the GitHub Pages address. It is probably `https://ricktreetops.github.io/watson-fantasy-rugby/` — copy the exact address from the repo's **Settings → Pages** if that differs.
3. Under **Redirect URLs**, add that same address, and also add `http://127.0.0.1:8080` if you want to try the real login on your computer.

Leave the invite email template as it is. The page reads the link Supabase already sends.

## 5. Paste the two public values

1. Open **Project Settings** → **API Keys** (older projects call this **API**).
2. Copy the **Project URL**. It looks like `https://abcdef.supabase.co`.
3. Copy the **publishable** key if you see one (it starts with `sb_publishable_`). If the only public key is labelled **anon** or **public**, copy that instead.
4. Do **not** copy a key labelled **secret** or **service_role**. That key can bypass the privacy rules. It never goes in `config.js` or in a message.
5. Open `config.js` in this project and replace the two placeholders:

```js
window.WFR_CONFIG = {
  supabaseUrl: "https://abcdef.supabase.co",
  supabaseAnonKey: "the-public-key"
};
```

6. Commit that file and push it, then merge this branch when you are happy with the preview. The public key is meant to be in the website. The database rules are what keep each team private until lock.

## 6. Invite the four players

Invite **your own email first**. The first invite is Richard, the league admin.

1. Open **Authentication** → **Users** → **Invite user** (or **Add user** → **Send invitation**).
2. Invite Richard's email. Wait until that user appears in the list.
3. Then invite Sharon, Brooke and Cameron, one each.

Each person opens the email (check junk mail) and taps the link. The site asks them to choose a password of at least 8 characters. After that they log in with email and password. There is no sign-up page.

If the invite goes to the wrong person first, delete **all** the users under **Authentication → Users** and start this step again with Richard's email.

## 7. Match the other three emails

1. Log in as Richard.
2. Open **Squads, scores and logins** → **Family logins** → **Show logins**.
3. Only Richard sees the email addresses. Choose Sharon, Brooke or Cameron for each of the other three and press **Save name**.

Until a login has a name, that person sees a note asking you to do this. They can't save a team yet.

You can ignore `supabase/name_players.sql`. It is only a backup if this screen misbehaves: replace the three placeholder emails in that file and run it once in the SQL editor.

## 8. Tell the family

Send them the GitHub Pages address. They log in, pick a round, and press **Save team**. They can change it until the first kick-off of that round. After that the team is locked and everyone can see it.

## What you do each weekend

Log in as Richard and open **Squads, scores and logins**.

- **Squads**: when a union announces a squad change, edit the note and availability, or add the player under the name they published. Don't add anyone who hasn't been named.
- **Matches**: pick the game, enter the score, and enter each player's published stats (tries, kicks, metres, tackles, player of the match, cards). You can paste JSON in the shape shown on that screen if that's easier.
- **Team sheet**: optional. One name per line, spelled as in the squad list. The pick screen then says if someone is on the bench or not in the 23.
- **Lock times**: only if a kick-off actually moves. Times are UK time, which is GMT for this competition.
- Finals weekend starts as "1st North" and so on. When the match-ups are known, edit the home and away names on **Matches**.

The table adds itself up from the saved teams and the stats. You don't type the totals.

## If something breaks

- **The email never arrives.** Check junk. On the free plan the message comes from Supabase. You can also use **Email me a sign-in link** on the login screen once the person has been invited.
- **The site says it can't connect.** Open the Supabase dashboard. Free projects sleep after about a week with no visits. If you see **Resume project**, press it. During November, people opening the site is enough to keep it awake. Supabase emails you before a project is paused.
- **"This league only has four players."** Four logins already exist. Delete a spare user in **Authentication → Users** before inviting again.
- **A team looks wrong after lock.** Locked teams can't be edited, including by Richard. That's the rule. Stats can still be corrected, and the points update.

## Try the preview without any of the above

On your computer, in this project folder:

```bash
python3 -m http.server 8080
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080). Continue as Richard, save a team, then continue as Sharon and open Scores: Richard's team is hidden. Back as Richard, use **Pretend this round has kicked off**. Scores and the table then show everyone, using made-up results, and the team can no longer be changed.
