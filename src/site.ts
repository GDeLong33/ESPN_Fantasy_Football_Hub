export const LEAGUE_NAME = 'Woo She Woo Bing Chiling';
export const HOUSE_AUTHOR = 'Stephen A. DeLong';

export type Brand = { mark: string; title: string };

export const HUB_BRAND: Brand = { mark: 'WSWBC', title: LEAGUE_NAME };
export const GAME_BRAND: Brand = { mark: 'CYBA', title: 'Can you beat Austin?' };

/**
 * Top-level nav. To add a section (power rankings, trade desk...), add its
 * routes in App.tsx and an entry here. `brand` is the header mark shown
 * while any route under `match` is active.
 */
export const NAV: { label: string; to: string; match: string[]; brand: Brand }[] = [
  { label: 'Home', to: '/', match: ['/', '/news'], brand: HUB_BRAND },
  { label: 'Play the game', to: '/play', match: ['/play'], brand: GAME_BRAND },
  { label: 'Results', to: '/results', match: ['/results'], brand: GAME_BRAND },
];

export function navItemFor(pathname: string) {
  return (
    NAV.find((n) => n.match.some((m) => (m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(m + '/')))) ??
    NAV[0]
  );
}
