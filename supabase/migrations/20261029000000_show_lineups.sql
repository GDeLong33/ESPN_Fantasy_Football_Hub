-- Show every entry's lineup on the board right away, not just after kickoff.
-- Paste this whole file into the Supabase SQL editor and click Run (after the first two). Safe to run again.

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
    (
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
    ) as lineup
  from public.entries e
  where e.season = p_season and e.week = p_week
  order by proj_total desc, e.created_at;
$$;

revoke all on function public.entry_board(int, int) from public;
grant execute on function public.entry_board(int, int) to anon, authenticated, service_role;
