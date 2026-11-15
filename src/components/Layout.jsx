import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const GAME_LINKS = [
  { to: '/fairness', label: 'Fair rolls' },
  { to: '/download', label: 'Download' },
  { to: '/login', label: 'Log in' },
];

// Scrolls to the #hash after a route change, or to the top.
function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Header() {
  const { pathname } = useLocation();
  const here = pathname.replace(/\/+$/, '') || '/';
  return (
    <header className="container site-header">
      <Link className="brand" to="/"><img src="/assets/logo.png" alt="" />The Shards</Link>
      <nav className="nav" aria-label="Main">
        {GAME_LINKS.map((l) => (
          <Link key={l.to} to={l.to} aria-current={here === l.to ? 'page' : undefined}>{l.label}</Link>
        ))}
        <Link to="/#legal">Terms</Link>
        <Link className="nav-cta" to="/#playtest">Join the playtest</Link>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-left">
          <div className="brand">The Shards</div>
          <div className="muted">Copyright 2026 Shards. All rights reserved.</div>
          <div className="footer-links">
            <Link className="link-row" to="/#legal">Terms</Link>
            <Link className="link-row" to="/#legal">Privacy</Link>
            <Link className="link-row" to="/login">Log in</Link>
            <Link className="link-row" to="/signup">Sign up</Link>
            <a className="link-row" href="https://discord.gg/fsArCAUU5" target="_blank" rel="noopener noreferrer">Contact</a>
          </div>
        </div>
        <div className="footer-right">
          <Link className="link-row" to="/fairness">Fair rolls: check any egg</Link>
          <span className="slogan">Made by gamers for gamers</span>
        </div>
      </div>
    </footer>
  );
}

// Every route: the skip link first, the header, one <main id="main"> (plain, or the narrow "prose" column), the footer.
export default function Layout({ children, prose = false }) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <ScrollToHash />
      <Header />
      <main id="main" className={prose ? 'prose' : undefined}>{children}</main>
      <Footer />
    </>
  );
}
