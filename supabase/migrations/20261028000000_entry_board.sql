-- Week board: projected totals for every entry, lineups revealed at kickoff.
-- Paste this whole file into the Supabase SQL editor and click Run (after the first file). Safe to run again.

-- The pool now remembers player details and projections. Players claimed off waivers
-- before kickoff stay in the table (so existing entries keep their projection) but are
-- marked unavailable, so new entries can't pick them.
alter table public.week_pool add column if not exists name      text;
alter table public.week_pool add column if not exists team      text;
alter table public.week_pool add column if not exists proj      numeric not null default 0;
alter table public.week_pool add column if not exists available boolean not null default true;

create or replace function public.sync_week(
  p_season    int,
  p_week      int,
  p_lock_time timestamptz,
  p_slots     jsonb,
  p_players   jsonb  -- [{ "id": 123, "pos": "RB", "name": "...", "team": "DAL", "projPts": 9.1 }, ...]
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

  update public.week_pool set available = false where season = p_season and week = p_week;
  insert into public.week_pool (season, week, player_id, pos, name, team, proj, available)
  select p_season, p_week, (e ->> 'id')::bigint, e ->> 'pos', e ->> 'name', e ->> 'team',
         coalesce((e ->> 'projPts')::numeric, 0), true
  from jsonb_array_elements(p_players) as e
  on conflict (season, week, player_id) do update
    set pos = excluded.pos, name = excluded.name, team = excluded.team, proj = excluded.proj, available = true;

  return 'synced';
end;
$$;

revoke all on function public.sync_week(int, int, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_week(int, int, timestamptz, jsonb, jsonb) to service_role;

-- Same rules as before, except a player must still be available.
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
      where p.season = new.season and p.week = new.week and p.player_id = pid and p.available;
    if not found then
      raise exception '%: that player is not on the waiver wire.', slot ->> 'slot';
    end if;
    if not ((slot -> 'accepts') ? ppos) then
      raise exception '%: a % can''t play there.', slot ->> 'slot', ppos;
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object('slot', e ->> 'slot', 'playerId', (e ->> 'playerId')::bigint) order by ord)
    into new.lineup
    from jsonb_array_elements(new.lineup) with ordinality as t (e, ord);

  return new;
end;
$$;

revoke all on function public.validate_entry() from public, anon, authenticated;

-- The board. Anyone can call it. Totals are always shown; the lineup column stays
-- null until the week locks, so nobody can copy picks before kickoff.
create or replace function public.entry_board(p_season int, p_week int)
returns table (
  entry_id   uuid,
  name       text,
  team_name  text,
  created_at timestamptz,
  proj_total numeric,
  lineup     jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.name,
    e.team_name,
    e.created_at,
    round(coalesce((
      select sum(p.proj)
      from jsonb_array_elements(e.lineup) as x
      join public.week_pool p
        on p.season = e.season and p.week = e.week and p.player_id = (x ->> 'playerId')::bigint
    ), 0), 2) as proj_total,
    case when now() >= w.lock_time then (
      select jsonb_agg(jsonb_build_object(
               'slot', x ->> 'slot',
               'playerId', (x ->> 'playerId')::bigint,
               'name', p.name,
               'pos', p.pos,
               'team', p.team,
               'proj', p.proj
             ) order by ord)
      from jsonb_array_elements(e.lineup) with ordinality as t (x, ord)
      left join public.week_pool p
        on p.season = e.season and p.week = e.week and p.player_id = (x ->> 'playerId')::bigint
    ) end as lineup
  from public.entries e
  join public.weeks w on w.season = e.season and w.week = e.week
  where e.season = p_season and e.week = p_week
  order by proj_total desc, e.created_at;
$$;

revoke all on function public.entry_board(int, int) from public;
grant execute on function public.entry_board(int, int) to anon, authenticated, service_role;
