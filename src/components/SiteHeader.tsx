import { Link, NavLink, useLocation } from 'react-router-dom';
import { NAV, navItemFor } from '../site';
import { ThemeToggle } from './ThemeToggle';

export function SiteHeader() {
  const { pathname } = useLocation();
  const current = navItemFor(pathname);
  const { brand } = current;

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to={current.to} className="brand" aria-label={`${brand.title}, ${current.label}`}>
          <span className="brand__mark" aria-hidden="true">
            {brand.mark}
          </span>
          <span className="brand__title">{brand.title}</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={item === current ? 'active' : undefined}
              aria-current={item === current ? 'page' : undefined}
            >
              {item.label}
            </NavLink>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
