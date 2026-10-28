-- Watson Family Fantasy Rugby
-- Paste this whole file into the Supabase SQL editor and press Run.
-- It creates the tables and the rules that keep each person's team private until lock.
-- It does not create passwords or store any.

begin;

create table if not exists public.league_settings (
  id int primary key check (id = 1),
  max_per_nation int not null default 3,
  captain_multiplier numeric not null default 2,
  supersub_multiplier numeric not null default 3,
  supersub_if_starts_multiplier numeric not null default 0.5
);

create table if not exists public.slot_groups (
  slot text primary key,
  groups text[] not null
);

create table if not exists public.rounds (
  id text primary key,
  name text not null,
  lock_at timestamptz not null,
  note text,
  sort_order int not null
);

create table if not exists public.fixtures (
  id text primary key,
  round_id text not null references public.rounds (id),
  kickoff_at timestamptz not null,
  home text not null,
  away text not null,
  venue text,
  status text not null default 'scheduled',
  expected_announcement text
);

create table if not exists public.unions (
  code text primary key,
  name text not null,
  status text,
  announced_on date,
  note text,
  source text
);

create table if not exists public.players (
  id text primary key,
  union_code text not null references public.unions (code),
  name text not null,
  position_group text not null check (position_group in ('PR','HK','LK','BR','FX','SH','FH','CE','B3','BX')),
  availability text not null default 'Squad' check (availability in ('Squad','Doubt','Out')),
  note text,
  unique (union_code, name)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name in ('Richard','Sharon','Brooke','Cameron')),
  is_admin boolean not null default false,
  unique (display_name)
);

create table if not exists public.fantasy_teams (
  user_id uuid not null references public.profiles (id) on delete cascade,
  round_id text not null references public.rounds (id),
  slots jsonb not null default '{}'::jsonb,
  captain text,
  supersub text,
  predictions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, round_id)
);

create table if not exists public.results (
  fixture_id text primary key references public.fixtures (id) on delete cascade,
  home_score int not null check (home_score >= 0),
  away_score int not null check (away_score >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_match_stats (
  fixture_id text not null references public.fixtures (id) on delete cascade,
  player_id text not null references public.players (id),
  started boolean not null default false,
  tries int not null default 0 check (tries >= 0),
  conversions int not null default 0 check (conversions >= 0),
  penalty_goals int not null default 0 check (penalty_goals >= 0),
  drop_goals int not null default 0 check (drop_goals >= 0),
  metres_carried int not null default 0 check (metres_carried >= 0),
  tackles int not null default 0 check (tackles >= 0),
  potm boolean not null default false,
  yellow int not null default 0 check (yellow >= 0),
  red int not null default 0 check (red >= 0),
  primary key (fixture_id, player_id)
);

create table if not exists public.lineups (
  fixture_id text not null references public.fixtures (id) on delete cascade,
  side text not null check (side in ('home','away')),
  starting jsonb not null default '[]'::jsonb,
  bench jsonb not null default '[]'::jsonb,
  source text,
  primary key (fixture_id, side)
);

create index if not exists players_union_idx on public.players (union_code);
create index if not exists fixtures_round_idx on public.fixtures (round_id);
create index if not exists fantasy_teams_round_idx on public.fantasy_teams (round_id);

alter table public.league_settings enable row level security;
alter table public.slot_groups enable row level security;
alter table public.rounds enable row level security;
alter table public.fixtures enable row level security;
alter table public.unions enable row level security;
alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.results enable row level security;
alter table public.player_match_stats enable row level security;
alter table public.lineups enable row level security;

create or replace function public.is_league_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.round_is_locked(rid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select lock_at <= now() from public.rounds where id = rid), true)
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, supabase_auth_admin;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  lock table public.profiles in exclusive mode;
  select count(*) into n from public.profiles;
  if n >= 4 then
    raise exception 'This league only has four players';
  end if;
  if n = 0 then
    insert into public.profiles (id, display_name, is_admin)
    values (new.id, 'Richard', true);
  else
    insert into public.profiles (id)
    values (new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.ensure_profile()
returns table (display_name text, is_admin boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    lock table public.profiles in exclusive mode;
    select count(*) into n from public.profiles;
    if n >= 4 then
      raise exception 'This league only has four players';
    end if;
    if n = 0 then
      insert into public.profiles (id, display_name, is_admin)
      values (auth.uid(), 'Richard', true);
    else
      insert into public.profiles (id) values (auth.uid());
    end if;
  end if;
  return query
    select p.display_name, p.is_admin from public.profiles p where p.id = auth.uid();
end;
$$;

create or replace function public.league_accounts()
returns table (id uuid, email text, display_name text, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email::text, p.display_name, p.is_admin
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.is_league_admin()
$$;

create or replace function public.assign_player(target uuid, player_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_admin() then
    raise exception 'Only the league admin can do that';
  end if;
  if player_name not in ('Sharon','Brooke','Cameron') then
    raise exception 'Choose Sharon, Brooke or Cameron';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'That login is not in the league';
  end if;
  if exists (select 1 from public.profiles where id = target and display_name = 'Richard') then
    raise exception 'Richard stays as the league admin';
  end if;
  update public.profiles
  set display_name = null
  where display_name = player_name and id <> target;
  update public.profiles
  set display_name = player_name
  where id = target;
end;
$$;

create or replace function public.server_now()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now()
$$;

create or replace function private.validate_fantasy_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  grp text;
  code text;
  allowed text[];
  seen text[] := array[]::text[];
  counts jsonb := '{}'::jsonb;
  maxn int;
  pred record;
  fx record;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.round_id is distinct from old.round_id then
      raise exception 'Cannot move a saved team to another person or round';
    end if;
  end if;
  if new.slots is null then new.slots := '{}'::jsonb; end if;
  if new.predictions is null then new.predictions := '{}'::jsonb; end if;
  if jsonb_typeof(new.slots) <> 'object' or jsonb_typeof(new.predictions) <> 'object' then
    raise exception 'Team data is not in the right shape';
  end if;
  select max_per_nation into maxn from public.league_settings where id = 1;
  if maxn is null then maxn := 3; end if;

  for rec in select key as slot, value as pid from jsonb_each_text(new.slots)
  loop
    if rec.pid is null or rec.pid = '' then continue; end if;
    select groups into allowed from public.slot_groups where slot = rec.slot;
    if allowed is null then
      raise exception 'Unknown position';
    end if;
    if rec.pid = any (seen) then
      raise exception 'That player is picked twice';
    end if;
    seen := array_append(seen, rec.pid);
    select position_group, union_code into grp, code from public.players where id = rec.pid;
    if grp is null then
      raise exception 'Unknown player';
    end if;
    if not (grp = any (allowed)) then
      raise exception 'That player cannot fill that position';
    end if;
    counts := jsonb_set(counts, array[code], to_jsonb(coalesce((counts ->> code)::int, 0) + 1), true);
  end loop;

  if new.captain is not null and new.captain <> '' then
    if not (new.captain = any (seen)) then
      raise exception 'Captain has to be one of your 15';
    end if;
  else
    new.captain := null;
  end if;

  if new.supersub is not null and new.supersub <> '' then
    if new.supersub = any (seen) then
      raise exception 'Supersub has to be someone outside your 15';
    end if;
    select union_code into code from public.players where id = new.supersub;
    if code is null then
      raise exception 'Unknown supersub';
    end if;
    counts := jsonb_set(counts, array[code], to_jsonb(coalesce((counts ->> code)::int, 0) + 1), true);
  else
    new.supersub := null;
  end if;

  for rec in select key as code, value::int as n from jsonb_each_text(counts)
  loop
    if rec.n > maxn then
      raise exception 'Too many players from one nation';
    end if;
  end loop;

  for pred in select key as fid, value as body from jsonb_each(new.predictions)
  loop
    if jsonb_typeof(pred.body) <> 'object' then
      raise exception 'Prediction is not in the right shape';
    end if;
    select f.id, f.round_id, f.home, f.away into fx
    from public.fixtures f
    where f.id = pred.fid;
    if not found or fx.round_id is distinct from new.round_id then
      raise exception 'Prediction is for a match outside this round';
    end if;
    if coalesce(pred.body ->> 'winner', '') <> ''
       and (pred.body ->> 'winner') not in (fx.home, fx.away, 'Draw') then
      raise exception 'Pick the home team, the away team, or a draw';
    end if;
    if coalesce(pred.body ->> 'margin', '') <> '' then
      if (pred.body ->> 'margin') !~ '^[0-9]+$' or (pred.body ->> 'margin')::int > 200 then
        raise exception 'Margin must be a whole number';
      end if;
    end if;
  end loop;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fantasy_teams_validate on public.fantasy_teams;
create trigger fantasy_teams_validate
  before insert or update on public.fantasy_teams
  for each row execute function private.validate_fantasy_team();

-- Who can see and change what. Logged-out visitors can see nothing.
drop policy if exists settings_read on public.league_settings;
create policy settings_read on public.league_settings
  for select to authenticated using (true);

drop policy if exists slots_read on public.slot_groups;
create policy slots_read on public.slot_groups
  for select to authenticated using (true);

drop policy if exists rounds_read on public.rounds;
create policy rounds_read on public.rounds
  for select to authenticated using (true);
drop policy if exists rounds_admin on public.rounds;
create policy rounds_admin on public.rounds
  for update to authenticated
  using (public.is_league_admin())
  with check (public.is_league_admin());

drop policy if exists fixtures_read on public.fixtures;
create policy fixtures_read on public.fixtures
  for select to authenticated using (true);
drop policy if exists fixtures_admin on public.fixtures;
create policy fixtures_admin on public.fixtures
  for update to authenticated
  using (public.is_league_admin())
  with check (public.is_league_admin());

drop policy if exists unions_read on public.unions;
create policy unions_read on public.unions
  for select to authenticated using (true);
drop policy if exists unions_admin on public.unions;
create policy unions_admin on public.unions
  for update to authenticated
  using (public.is_league_admin())
  with check (public.is_league_admin());

drop policy if exists players_read on public.players;
create policy players_read on public.players
  for select to authenticated using (true);
drop policy if exists players_admin_write on public.players;
create policy players_admin_write on public.players
  for all to authenticated
  using (public.is_league_admin())
  with check (public.is_league_admin());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists teams_read on public.fantasy_teams;
create policy teams_read on public.fantasy_teams
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.round_is_locked(round_id)
  );

drop policy if exists teams_insert on public.fantasy_teams;
create policy teams_insert on public.fantasy_teams
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.round_is_locked(round_id)
  );

drop policy if exists teams_update on public.fantasy_teams;
create policy teams_update on public.fantasy_teams
  for update to authenticated
  using (user_id = auth.uid() and not public.round_is_locked(round_id))
  with check (user_id = auth.uid() and not public.round_is_locked(round_id));

drop policy if exists teams_delete on public.fantasy_teams;
create policy teams_delete on public.fantasy_teams
  for delete to authenticated
  using (user_id = auth.uid() and not public.round_is_locked(round_id));

drop policy if exists results_read on public.results;
create policy results_read on public.results
  for select to authenticated using (true);
drop policy if exists results_admin on public.results;
create policy results_admin on public.results
  for all to authenticated
  using (public.is_league_admin())
  with check (public.is_league_admin());

drop policy if exists stats_read on public.player_match_stats;
create policy stats_read on public.player_match_stats
  for select to authenticated using (true);
drop policy if exists stats_admin on public.player_match_stats;
create policy stats_admin on public.player_match_stats
  for all to authenticated
  using (public.is_league_admin())
  with check (public.is_league_admin());

drop policy if exists lineups_read on public.lineups;
create policy lineups_read on public.lineups
  for select to authenticated using (true);
drop policy if exists lineups_admin on public.lineups;
create policy lineups_admin on public.lineups
  for all to authenticated
  using (public.is_league_admin())
  with check (public.is_league_admin());

revoke all on all tables in schema public from public, anon;
grant usage on schema public to authenticated;
grant select on
  public.league_settings,
  public.slot_groups,
  public.rounds,
  public.fixtures,
  public.unions,
  public.players,
  public.profiles,
  public.fantasy_teams,
  public.results,
  public.player_match_stats,
  public.lineups
to authenticated;
grant insert, update, delete on public.fantasy_teams to authenticated;
grant update on public.rounds, public.fixtures, public.unions to authenticated;
grant insert, update, delete on public.players, public.results, public.player_match_stats, public.lineups to authenticated;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.validate_fantasy_team() from public, anon, authenticated;
grant execute on function private.handle_new_user() to supabase_auth_admin;
grant execute on function private.validate_fantasy_team() to authenticated;
revoke all on function public.is_league_admin() from public, anon;
revoke all on function public.round_is_locked(text) from public, anon;
revoke all on function public.ensure_profile() from public, anon;
revoke all on function public.league_accounts() from public, anon;
revoke all on function public.assign_player(uuid, text) from public, anon;
revoke all on function public.server_now() from public, anon;
grant execute on function public.is_league_admin() to authenticated;
grant execute on function public.round_is_locked(text) to authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.league_accounts() to authenticated;
grant execute on function public.assign_player(uuid, text) to authenticated;
grant execute on function public.server_now() to authenticated;

comment on table public.fantasy_teams is 'Each person''s team for a round. Other people cannot read it until the round locks.';

commit;
