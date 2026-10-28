import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LockInPage } from './sections/game/LockInPage';
import { PlayPage } from './sections/game/PlayPage';
import { ResultsPage } from './sections/game/ResultsPage';
import { HomePage } from './sections/news/HomePage';
import { NewsArchive } from './sections/news/NewsArchive';
import { StoryPage } from './sections/news/StoryPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* News hub */}
          <Route index element={<HomePage />} />
          <Route path="news" element={<NewsArchive />} />
          <Route path="news/:slug" element={<StoryPage />} />
          {/* Can You Beat Austin? */}
          <Route path="play" element={<PlayPage />} />
          <Route path="play/lock-in" element={<LockInPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function NotFound() {
  return (
    <div className="container page-intro">
      <h1 className="display page-title">Page not found</h1>
      <Link className="text-link" to="/">
        ← Back to the front page
      </Link>
    </div>
  );
}
