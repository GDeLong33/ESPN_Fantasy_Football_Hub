import type { PoolPlayer, SlotDef } from './lineup';

// Shapes of the files written by scripts/fetch-espn.mjs.

/** public/data/meta.json */
export type MetaFile = {
  updatedAt: string;
  season: number;
  week: number;
  lockTime: string | null;
  isFinal: boolean;
  leagueName: string;
  slots: SlotDef[];
};

/** public/data/freeagents.json */
export type FreeAgentsFile = { updatedAt: string; season: number; week: number; players: PoolPlayer[] };

/** public/data/austin.json */
export type AustinFile = {
  updatedAt: string;
  week: number;
  teamId: number;
  teamName: string;
  lineup: { slot: string; playerId: number; name: string; pos: string; team: string | null; projPts: number | null; actualPts: number | null }[];
  projTotal: number;
  actualTotal: number;
};

/** public/data/league.json */
export type LeagueFile = {
  updatedAt: string;
  week: number;
  teams: { teamId: number; name: string; owner: string; projTotal: number; actualTotal: number; isAustin: boolean }[];
};

/** public/data/results.json, written by the scoring Action. */
export type ResultsFile = {
  updatedAt: string;
  season: number;
  tally: { austin: number; field: number };
  weeks: {
    week: number;
    austinPoints: number;
    topEntryName: string | null;
    topEntryPoints: number | null;
    winner: 'austin' | 'field';
  }[];
};
