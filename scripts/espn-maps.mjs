// ESPN's fantasy football API uses numeric IDs everywhere. All lookups live here.

/** player.defaultPositionId -> position label */
export const POSITIONS = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST',
};

/** lineupSlotId -> slot label, plus the positions that may fill it. */
export const SLOTS = {
  0: { label: 'QB', accepts: ['QB'] },
  1: { label: 'TQB', accepts: ['QB'] },
  2: { label: 'RB', accepts: ['RB'] },
  3: { label: 'RB/WR', accepts: ['RB', 'WR'] },
  4: { label: 'WR', accepts: ['WR'] },
  5: { label: 'WR/TE', accepts: ['WR', 'TE'] },
  6: { label: 'TE', accepts: ['TE'] },
  7: { label: 'OP', accepts: ['QB', 'RB', 'WR', 'TE'] },
  16: { label: 'D/ST', accepts: ['D/ST'] },
  17: { label: 'K', accepts: ['K'] },
  20: { label: 'BE', accepts: [] },
  21: { label: 'IR', accepts: [] },
  23: { label: 'FLEX', accepts: ['RB', 'WR', 'TE'] },
};

/** Slots that do not score. */
export const NON_STARTING_SLOTS = new Set([20, 21]);

/** Display order for the lineup card (matches the ESPN lineup page). */
export const SLOT_ORDER = [0, 1, 2, 3, 4, 5, 6, 23, 7, 16, 17];

/** player.injuryStatus -> short tag. Healthy statuses map to null. */
export const INJURY = {
  ACTIVE: null,
  NORMAL: null,
  PROBABLE: 'P',
  QUESTIONABLE: 'Q',
  DOUBTFUL: 'D',
  OUT: 'O',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'SSPD',
  DAY_TO_DAY: 'DTD',
};

/** stats[].statSourceId */
export const STAT_SOURCE = { ACTUAL: 0, PROJECTED: 1 };
/** stats[].statSplitTypeId: 1 = a single scoring period (week). */
export const SPLIT_WEEK = 1;
