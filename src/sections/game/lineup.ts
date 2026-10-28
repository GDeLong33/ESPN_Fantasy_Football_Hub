// Lineup rules for the draft room. Kept free of React so they can be unit-tested
// and mirrored by the database validation in Phase 4.

/** One starting slot, from meta.json (derived from ESPN mSettings). */
export type SlotDef = { slot: string; accepts: string[] };

export type PoolPlayer = {
  id: number;
  name: string;
  pos: string;
  team: string | null;
  injury: string | null;
  ownedPct: number;
  projPts: number;
  /** "@ DAL" / "vs DAL"; null on a bye or with no NFL team. */
  opp?: string | null;
  /** Opponent's rank against this position: 1 = toughest, 32 = easiest. */
  oppRank?: number | null;
};

/** Player id per slot, aligned by index with the slot list. */
export type Lineup = (number | null)[];

/** What gets submitted: one pick per slot, in slot order. */
export type Pick = { slot: string; playerId: number };

export const emptyLineup = (slots: SlotDef[]): Lineup => slots.map(() => null);

export const canFill = (slot: SlotDef, pos: string) => slot.accepts.includes(pos);

/**
 * Index of the slot a player should go into, or -1 if none is open.
 * A dedicated slot (RB) is used before a shared one (FLEX).
 */
export function slotFor(slots: SlotDef[], lineup: Lineup, pos: string): number {
  const open = (i: number) => lineup[i] == null && canFill(slots[i], pos);
  const dedicated = slots.findIndex((s, i) => open(i) && s.accepts.length === 1);
  return dedicated !== -1 ? dedicated : slots.findIndex((_, i) => open(i));
}

export function addPlayer(slots: SlotDef[], lineup: Lineup, player: Pick['playerId'], pos: string): Lineup {
  if (lineup.includes(player)) return lineup;
  const i = slotFor(slots, lineup, pos);
  if (i === -1) return lineup;
  const next = lineup.slice();
  next[i] = player;
  return next;
}

export function removePlayer(lineup: Lineup, playerId: number): Lineup {
  return lineup.map((id) => (id === playerId ? null : id));
}

/** Keep a saved lineup only where it still fits the current slots and pool. */
export function reconcile(slots: SlotDef[], saved: unknown, byId: Map<number, PoolPlayer>): Lineup {
  if (!Array.isArray(saved) || saved.length !== slots.length) return emptyLineup(slots);
  const seen = new Set<number>();
  return slots.map((s, i) => {
    const id = saved[i];
    const p = typeof id === 'number' ? byId.get(id) : undefined;
    if (!p || seen.has(p.id) || !canFill(s, p.pos)) return null;
    seen.add(p.id);
    return p.id;
  });
}

export function lineupTotal(lineup: Lineup, byId: Map<number, PoolPlayer>): number {
  const sum = lineup.reduce<number>((acc, id) => acc + (id == null ? 0 : (byId.get(id)?.projPts ?? 0)), 0);
  return Math.round(sum * 100) / 100;
}

export const filledCount = (lineup: Lineup) => lineup.filter((id) => id != null).length;

export function toPicks(slots: SlotDef[], lineup: Lineup): Pick[] | null {
  if (lineup.some((id) => id == null)) return null;
  return slots.map((s, i) => ({ slot: s.slot, playerId: lineup[i] as number }));
}

/**
 * Full check of a submitted lineup. Returns a list of problems (empty = valid).
 * `positions` maps every player in the free-agent pool to their position.
 */
export function validateLineup(slots: SlotDef[], picks: unknown, positions: Map<number, string>): string[] {
  if (!Array.isArray(picks)) return ['Lineup must be a list of picks.'];
  const errors: string[] = [];
  if (picks.length !== slots.length) errors.push(`Lineup needs exactly ${slots.length} players.`);
  const seen = new Set<number>();
  picks.slice(0, slots.length).forEach((pick, i) => {
    const slot = slots[i];
    const id = (pick as Pick)?.playerId;
    if ((pick as Pick)?.slot !== slot.slot) {
      errors.push(`Pick ${i + 1} should be the ${slot.slot} slot.`);
      return;
    }
    if (typeof id !== 'number' || !positions.has(id)) {
      errors.push(`${slot.slot}: that player is not on the waiver wire.`);
      return;
    }
    if (seen.has(id)) errors.push(`${slot.slot}: a player can only be used once.`);
    seen.add(id);
    const pos = positions.get(id)!;
    if (!canFill(slot, pos)) errors.push(`${slot.slot}: a ${pos} can't play there.`);
  });
  return errors;
}
