import { loadData } from '../../lib/data';
import type { PoolPlayer } from './lineup';
import type { AustinFile, FreeAgentsFile, LeagueFile, MetaFile } from './types';

export type GameData = {
  meta: MetaFile;
  pool: FreeAgentsFile;
  austin: AustinFile;
  league: LeagueFile | null;
  byId: Map<number, PoolPlayer>;
};

/** Everything the draft room and lock-in page need for the current week. */
export async function loadGameData(): Promise<GameData> {
  const [meta, pool, austin, league] = await Promise.all([
    loadData<MetaFile>('meta.json'),
    loadData<FreeAgentsFile>('freeagents.json'),
    loadData<AustinFile>('austin.json'),
    loadData<LeagueFile>('league.json'),
  ]);
  if (!meta.data || !pool.data || !austin.data) {
    throw new Error("This week's league data hasn't been published yet");
  }
  if (!Array.isArray(meta.data.slots) || meta.data.slots.length === 0) {
    throw new Error('meta.json has no lineup slots');
  }
  return {
    meta: meta.data,
    pool: pool.data,
    austin: austin.data,
    league: league.data,
    byId: new Map(pool.data.players.map((p) => [p.id, p])),
  };
}

export const INJURY_LABELS: Record<string, string> = {
  P: 'Probable',
  Q: 'Questionable',
  D: 'Doubtful',
  O: 'Out',
  IR: 'Injured reserve',
  SSPD: 'Suspended',
  DTD: 'Day to day',
};

export const fmtPts = (n: number | null | undefined) => (n == null ? '--' : n.toFixed(1));
