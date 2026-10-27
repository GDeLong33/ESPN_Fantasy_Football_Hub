/** public/data/meta.json */
export type MetaFile = { season: number; week: number; lockTime: string | null; isFinal: boolean };

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
