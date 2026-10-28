// Scoring rules for Can You Beat Austin? Pure functions: no network, no filesystem.

const round = (n) => Math.round(n * 100) / 100;

/**
 * Score each entry by summing its players' actual points. A player with no stat line
 * (bye week, inactive) scores 0, as on ESPN. Returns entries best first; ties keep
 * submission order.
 */
export function scoreEntries(entries, players) {
  return entries
    .map((e) => {
      const lineup = (e.lineup ?? []).map((pick) => {
        const p = players.get(pick.playerId);
        return {
          slot: pick.slot,
          playerId: pick.playerId,
          name: p?.name ?? `Player ${pick.playerId}`,
          pos: p?.pos ?? null,
          team: p?.team ?? null,
          points: round(p?.points ?? 0),
        };
      });
      return {
        entryId: e.id,
        name: e.name,
        teamName: e.team_name ?? null,
        createdAt: e.created_at,
        points: round(lineup.reduce((sum, p) => sum + p.points, 0)),
        lineup,
      };
    })
    .sort((a, b) => b.points - a.points || String(a.createdAt).localeCompare(String(b.createdAt)));
}

/**
 * Austin wins the week if his actual total is greater than or equal to the best entry.
 * Returns null when nobody entered (no result, the tally doesn't move).
 */
export function decideWeek(austinPoints, scored) {
  if (!scored.length) return null;
  const top = scored[0];
  return {
    winner: austinPoints >= top.points ? 'austin' : 'field',
    topEntryId: top.entryId,
    topEntryName: top.name,
    topEntryPoints: top.points,
  };
}

/** Season summary from weekly_results rows (the database is the source of truth). */
export function buildSeasonResults(rows, season) {
  const weeks = rows
    .filter((r) => r.season === season)
    .sort((a, b) => a.week - b.week)
    .map((r) => {
      const scores = Array.isArray(r.entry_scores) ? r.entry_scores : [];
      const top = scores.find((s) => s.entryId === r.top_entry_id) ?? scores[0] ?? null;
      return {
        week: r.week,
        austinPoints: Number(r.austin_points),
        topEntryName: top?.name ?? null,
        topEntryPoints: top ? Number(top.points) : null,
        entryCount: scores.length,
        winner: r.winner,
      };
    });
  return {
    season,
    tally: {
      austin: weeks.filter((w) => w.winner === 'austin').length,
      field: weeks.filter((w) => w.winner === 'field').length,
    },
    weeks,
  };
}
