import { LEAGUE_NAME } from '../../site';

// Phase 3 replaces this with the draft room.
export function PlayPage() {
  return (
    <div className="container page-intro">
      <div className="kicker">{LEAGUE_NAME} · Waiver wire only</div>
      <h1 className="display page-title">
        Austin has the worst team in the league.
        <br />
        Surely you can beat him.
      </h1>
      <p>The draft room opens here soon. You'll build a lineup from free agents only and lock it in with your name.</p>
    </div>
  );
}
