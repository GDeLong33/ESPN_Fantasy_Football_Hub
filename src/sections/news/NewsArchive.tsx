import { DataState } from '../../components/DataState';
import { useAsync } from '../../lib/useAsync';
import { StoryGrid } from './StoryCards';
import { loadStories } from './stories';

/** Every story, newest first. */
export function NewsArchive() {
  const news = useAsync(() => loadStories(), []);
  return (
    <div className="container page-intro">
      <div className="kicker">Reported by Stephen A. DeLong</div>
      <h1 className="display page-title" style={{ marginBottom: 24 }}>
        All stories
      </h1>
      <DataState state={news} loading="Loading stories…">
        {({ stories }) => <StoryGrid stories={stories} />}
      </DataState>
    </div>
  );
}
