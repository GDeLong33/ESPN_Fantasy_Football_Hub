import { Outlet } from 'react-router-dom';
import { SampleProvider, useSampleFiles } from '../lib/sample';
import { LEAGUE_NAME } from '../site';
import { SiteHeader } from './SiteHeader';

function SampleBanner() {
  const files = useSampleFiles();
  if (files.length === 0) return null;
  return (
    <div className="sample-banner" role="note">
      <div className="container">
        <strong>Sample data</strong>
        Some numbers on this page are placeholders, not real league data. They will be replaced once the ESPN
        sync runs.
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <SampleProvider>
      {/* HashRouter owns the URL hash, so move focus by hand instead of href="#main". */}
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <SiteHeader />
      <SampleBanner />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          {LEAGUE_NAME} · an ESPN fantasy league. Unofficial fan site, not affiliated with ESPN.
        </div>
      </footer>
    </SampleProvider>
  );
}
