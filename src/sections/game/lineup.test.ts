import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  emptyLineup,
  lineupTotal,
  reconcile,
  removePlayer,
  slotFor,
  toPicks,
  validateLineup,
  type PoolPlayer,
  type SlotDef,
} from './lineup';

const S = (slot: string, ...accepts: string[]): SlotDef => ({ slot, accepts: accepts.length ? accepts : [slot] });
const SLOTS: SlotDef[] = [
  S('QB'),
  S('RB'),
  S('RB'),
  S('WR'),
  S('WR'),
  S('TE'),
  S('FLEX', 'RB', 'WR', 'TE'),
  S('D/ST'),
  S('K'),
];

const P = (id: number, pos: string, projPts = 10): PoolPlayer => ({
  id,
  name: `P${id}`,
  pos,
  team: null,
  injury: null,
  ownedPct: 0,
  projPts,
});
const pool = [P(1, 'QB'), P(2, 'RB'), P(3, 'RB'), P(4, 'RB'), P(5, 'WR'), P(6, 'WR'), P(7, 'TE'), P(8, 'D/ST'), P(9, 'K'), P(10, 'TE'), P(11, 'QB')];
const byId = new Map(pool.map((p) => [p.id, p]));
const positions = new Map(pool.map((p) => [p.id, p.pos]));

function build(ids: number[]) {
  return ids.reduce((l, id) => addPlayer(SLOTS, l, id, byId.get(id)!.pos), emptyLineup(SLOTS));
}

describe('adding players', () => {
  it('fills dedicated slots before FLEX', () => {
    const l = build([2, 3, 4]);
    expect(l).toEqual([null, 2, 3, null, null, null, 4, null, null]);
  });

  it('FLEX takes RB, WR or TE but never QB, K or D/ST', () => {
    const full = build([1, 2, 3, 5, 6, 7, 8, 9]);
    expect(slotFor(SLOTS, full, 'TE')).toBe(6);
    expect(slotFor(SLOTS, full, 'WR')).toBe(6);
    expect(slotFor(SLOTS, full, 'QB')).toBe(-1);
    expect(slotFor(SLOTS, full, 'K')).toBe(-1);
    expect(slotFor(SLOTS, full, 'D/ST')).toBe(-1);
  });

  it('ignores a player already in the lineup and a player with no open slot', () => {
    const l = build([1]);
    expect(addPlayer(SLOTS, l, 1, 'QB')).toBe(l);
    expect(addPlayer(SLOTS, l, 11, 'QB')).toBe(l);
  });

  it('removing frees the slot again', () => {
    const l = removePlayer(build([2, 3, 4]), 4);
    expect(l[6]).toBeNull();
  });

  it('totals projected points of filled slots', () => {
    const l = build([1, 2]);
    expect(lineupTotal(l, new Map([...byId, [1, P(1, 'QB', 14.77)]]))).toBe(24.77);
  });
});

describe('validateLineup', () => {
  const valid = toPicks(SLOTS, build([1, 2, 3, 5, 6, 7, 4, 8, 9]))!;

  it('accepts a complete legal lineup', () => {
    expect(validateLineup(SLOTS, valid, positions)).toEqual([]);
  });

  it('toPicks refuses an incomplete lineup', () => {
    expect(toPicks(SLOTS, build([1]))).toBeNull();
  });

  it('rejects the wrong length', () => {
    expect(validateLineup(SLOTS, valid.slice(0, 8), positions)).toContain('Lineup needs exactly 9 players.');
  });

  it('rejects duplicate players', () => {
    const dup = valid.map((p) => (p.slot === 'FLEX' ? { ...p, playerId: 2 } : p));
    expect(validateLineup(SLOTS, dup, positions)).toContain('FLEX: a player can only be used once.');
  });

  it('rejects a QB in FLEX', () => {
    const qbFlex = valid.map((p) => (p.slot === 'FLEX' ? { ...p, playerId: 11 } : p));
    expect(validateLineup(SLOTS, qbFlex, positions)).toEqual(["FLEX: a QB can't play there."]);
  });

  it('rejects players outside the pool and misordered slots', () => {
    const outside = valid.map((p, i) => (i === 0 ? { ...p, playerId: 999 } : p));
    expect(validateLineup(SLOTS, outside, positions)).toEqual(['QB: that player is not on the waiver wire.']);
    const swapped = [valid[1], valid[0], ...valid.slice(2)];
    expect(validateLineup(SLOTS, swapped, positions)[0]).toBe('Pick 1 should be the QB slot.');
    expect(validateLineup(SLOTS, 'nope', positions)).toEqual(['Lineup must be a list of picks.']);
  });
});

describe('reconcile', () => {
  it('drops saved picks that left the pool or no longer fit', () => {
    const saved = [1, 999, 3, null, null, null, 1, null, null];
    expect(reconcile(SLOTS, saved, byId)).toEqual([1, null, 3, null, null, null, null, null, null]);
    expect(reconcile(SLOTS, [1, 2], byId)).toEqual(emptyLineup(SLOTS));
  });
});
