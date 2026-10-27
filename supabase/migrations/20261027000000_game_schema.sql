-- Can You Beat Austin? database setup.
-- Paste this whole file into the Supabase SQL editor and click Run. Safe to run again.
--
-- Who can do what:
--   * Visitors (anon key) can submit an entry before kickoff, and read entries only
--     after the week locks. They can never edit or delete anything.
--   * The GitHub Actions (service role / secret key) sync each week's slots, lock time
--     and free-agent pool, and write the weekly results.

-- ---------------------------------------------------------------- tables

create table if not exists public.weeks (
  season     int         not null,
  week       int         not null,
  lock_time  timestamptz not null,
  slots      jsonb       not null,  -- [{ "slot": "QB", "accepts": ["QB"] }, ...] in lineup order
  updated_at timestamptz not null default now(),
  primary key (season, week),
  constraint weeks_slots_is_array check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) > 0)
);

-- The free agents a lineup may use that week. Frozen once the week locks.
create table if not exists public.week_pool (
  season    int    not null,
  week      int    not null,
  player_id bigint not null,
  pos       text   not null,
  primary key (season, week, player_id),
  foreign key (season, week) references public.weeks (season, week) on delete cascade
);

create table if not exists public.entries (
  id         uuid        primary key default gen_random_uuid(),
  season     int         not null,
  week       int         not null,
  name       text        not null,
  name_key   text        not null,  -- lowercase, trimmed: one entry per name per week
  team_name  text,
  lineup     jsonb       not null,  -- [{ "slot": "QB", "playerId": 123 }, ...] in slot order
  created_at timestamptz not null default now(),
  constraint entries_one_per_name unique (season, week, name_key),
  constraint entries_name_length check (char_length(name) between 2 and 40),
  constraint entries_team_length check (team_name is null or char_length(team_name) between 1 and 60),
  constraint entries_lineup_is_array check (jsonb_typeof(lineup) = 'array'),
  foreign key (season, week) references public.weeks (season, week)
);

create table if not exists public.weekly_results (
  season        int     not null,
  week          int     not null,
  austin_points numeric not null,
  top_entry_id  uuid    references public.entries (id) on delete set null,
  winner        text    not null check (winner in ('austin', 'field')),
  entry_scores  jsonb   not null default '[]'::jsonb,  -- [{ entryId, name, points }]
  updated_at    timestamptz not null default now(),
  primary key (season, week)
);

-- ---------------------------------------------------------------- entry validation
-- Runs on every insert, whoever inserts. The browser checks the same rules, but
-- this is the one that counts. Messages are shown to the visitor as-is.

create or replace function public.validate_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w     public.weeks%rowtype;
  n     int;
  i     int;
  slot  jsonb;
  pick  jsonb;
  pid   bigint;
  ppos  text;
  seen  bigint[] := '{}';
begin
  select * into w from public.weeks where season = new.season and week = new.week;
  if not found then
    raise exception 'Week % is not open for entries yet.', new.week;
  end if;
  if now() >= w.lock_time then
    raise exception 'Lineups are locked for week %. Kickoff has passed.', new.week;
  end if;

  -- Server decides these, whatever the client sent.
  new.id := gen_random_uuid();
  new.created_at := now();
  new.name := regexp_replace(btrim(coalesce(new.name, '')), '\s+', ' ', 'g');
  if char_length(new.name) not between 2 and 40 then
    raise exception 'Your name must be 2 to 40 characters.';
  end if;
  new.name_key := lower(new.name);
  new.team_name := nullif(regexp_replace(btrim(coalesce(new.team_name, '')), '\s+', ' ', 'g'), '');
  if char_length(new.team_name) > 60 then
    raise exception 'Team name must be 60 characters or fewer.';
  end if;

  if new.lineup is null or jsonb_typeof(new.lineup) <> 'array' then
    raise exception 'Lineup must be a list of picks.';
  end if;
  n := jsonb_array_length(w.slots);
  if jsonb_array_length(new.lineup) <> n then
    raise exception 'Lineup needs exactly % players.', n;
  end if;

  for i in 0 .. n - 1 loop
    slot := w.slots -> i;
    pick := new.lineup -> i;
    if jsonb_typeof(pick) <> 'object' or (pick ->> 'slot') is distinct from (slot ->> 'slot') then
      raise exception 'Pick % should be the % slot.', i + 1, slot ->> 'slot';
    end if;
    if jsonb_typeof(pick -> 'playerId') <> 'number' then
      raise exception '%: that player is not on the waiver wire.', slot ->> 'slot';
    end if;
    pid := (pick ->> 'playerId')::bigint;
    if pid = any (seen) then
      raise exception '%: a player can only be used once.', slot ->> 'slot';
    end if;
    seen := seen || pid;
    select p.pos into ppos from public.week_pool p
      where p.season = new.season and p.week = new.week and p.player_id = pid;
    if not found then
      raise exception '%: that player is not on the waiver wire.', slot ->> 'slot';
    end if;
    if not ((slot -> 'accepts') ? ppos) then
      raise exception '%: a % can''t play there.', slot ->> 'slot', ppos;
    end if;
  end loop;

  -- Store only { slot, playerId }, dropping anything extra the client sent.
  select jsonb_agg(jsonb_build_object('slot', e ->> 'slot', 'playerId', (e ->> 'playerId')::bigint) order by ord)
    into new.lineup
    from jsonb_array_elements(new.lineup) with ordinality as t (e, ord);

  return new;
end;
$$;

drop trigger if exists entries_validate on public.entries;
create trigger entries_validate
  before insert on public.entries
  for each row execute function public.validate_entry();

-- ---------------------------------------------------------------- weekly sync (GitHub Action only)

create or replace function public.sync_week(
  p_season    int,
  p_week      int,
  p_lock_time timestamptz,
  p_slots     jsonb,
  p_players   jsonb  -- [{ "id": 123, "pos": "RB" }, ...]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.weeks where season = p_season and week = p_week and lock_time <= now()) then
    return 'frozen';  -- the pool never changes after kickoff
  end if;

  insert into public.weeks (season, week, lock_time, slots)
  values (p_season, p_week, p_lock_time, p_slots)
  on conflict (season, week) do update
    set lock_time = excluded.lock_time, slots = excluded.slots, updated_at = now();

  delete from public.week_pool where season = p_season and week = p_week;
  insert into public.week_pool (season, week, player_id, pos)
  select p_season, p_week, (e ->> 'id')::bigint, e ->> 'pos'
  from jsonb_array_elements(p_players) as e
  on conflict do nothing;

  return 'synced';
end;
$$;

revoke all on function public.sync_week(int, int, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_week(int, int, timestamptz, jsonb, jsonb) to service_role;
revoke all on function public.validate_entry() from public, anon, authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.weeks          enable row level security;
alter table public.week_pool      enable row level security;
alter table public.entries        enable row level security;
alter table public.weekly_results enable row level security;

-- Table privileges: visitors may read weeks/results, insert and (after lock) read entries.
revoke all on public.weeks, public.week_pool, public.entries, public.weekly_results from anon, authenticated;
grant select on public.weeks, public.weekly_results to anon, authenticated;
grant select, insert on public.entries to anon, authenticated;

drop policy if exists "weeks are public" on public.weeks;
create policy "weeks are public" on public.weeks
  for select to anon, authenticated using (true);

drop policy if exists "results are public" on public.weekly_results;
create policy "results are public" on public.weekly_results
  for select to anon, authenticated using (true);

-- Lock time is enforced by the trigger; this policy just opens the door.
drop policy if exists "anyone can enter" on public.entries;
create policy "anyone can enter" on public.entries
  for insert to anon, authenticated with check (true);

-- No peeking: entries become readable only once their week has locked.
drop policy if exists "entries visible after lock" on public.entries;
create policy "entries visible after lock" on public.entries
  for select to anon, authenticated using (
    exists (
      select 1 from public.weeks w
      where w.season = entries.season and w.week = entries.week and now() >= w.lock_time
    )
  );

-- No update or delete policies: only the service role can change or remove rows.
