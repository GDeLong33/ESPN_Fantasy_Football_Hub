import { DataState } from '../../components/DataState';
import { useAsync } from '../../lib/useAsync';
import { PromoCard } from '../game/PromoCard';
import { TallyCard } from '../game/TallyCard';
import { Standings } from './Standings';
import { LeadStory, StoryGrid } from './StoryCards';
import { loadStories } from './stories';

export function HomePage() {
  const news = useAsync(loadStories, []);

  return (
    <div className="container">
      <div className="home-row home-row--top">
        <div className="home-main">
          <DataState state={news} loading={<div className="panel lead" style={{ minHeight: 320 }} />}>
            {({ stories }) => <LeadStory story={stories[0]} />}
          </DataState>
        </div>
        <div className="home-side">
          <PromoCard />
          <TallyCard />
        </div>
      </div>

      <div className="home-row home-row--bottom">
        <section className="home-main" aria-labelledby="latest-title">
          <h2 className="section-title" id="latest-title">
            Latest from the league
          </h2>
          <DataState state={news} loading="Loading stories…">
            {({ stories }) => <StoryGrid stories={stories.slice(1)} />}
          </DataState>
        </section>
        <div className="home-side">
          <Standings />
        </div>
      </div>
    </div>
  );
}
