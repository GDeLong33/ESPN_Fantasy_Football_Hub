import { supabase } from '../../lib/supabase';

/** One row from the entry_board() database function. */
export type BoardEntry = {
  entryId: string;
  name: string;
  teamName: string | null;
  createdAt: string;
  projTotal: number;
  /** Player details for each pick (null only if the database predates the show-lineups migration). */
  lineup: { slot: string; playerId: number; name: string | null; pos: string | null; team: string | null; proj: number | null }[] | null;
};

type Row = {
  entry_id: string;
  name: string;
  team_name: string | null;
  created_at: string;
  proj_total: number | string;
  lineup: BoardEntry['lineup'];
};

/** Every entry for a week, highest projection first. Null when Supabase isn't configured. */
export async function loadBoard(season: number, week: number): Promise<BoardEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('entry_board', { p_season: season, p_week: week });
  if (error) {
    // PGRST202: the function doesn't exist yet (second setup file not run).
    throw new Error(error.code === 'PGRST202' ? 'The entry board is still being set up' : error.message);
  }
  return ((data ?? []) as Row[]).map((r) => ({
    entryId: r.entry_id,
    name: r.name,
    teamName: r.team_name,
    createdAt: r.created_at,
    projTotal: Number(r.proj_total),
    lineup: r.lineup,
  }));
}
