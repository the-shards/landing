import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { usePageTitle } from '../components/usePageTitle.js';

// Legal documents are not written yet, so the cards say "Coming soon". When a PDF is ready, put it in public/legal/,
// replace "Coming soon" with "Last updated <date>" and add <a className="link-row" href="/legal/<file>.pdf" target="_blank" rel="noopener">Open PDF</a>.
const LEGAL = ['Terms and Conditions', 'Privacy Policy', 'Playtest Agreement'];

export default function Home() {
  usePageTitle('The Shards');
  return (
    <Layout>
      <section className="container hero" aria-labelledby="hero-title">
        <div className="hero-art">
          <img src="/assets/logo.png" alt="The Shards logo: a crown above crossed broken chains and green leaves" />
        </div>
        <div className="hero-text">
          <div className="badge">CLOSED PLAYTEST - WAVE ONE</div>
          <h1 id="hero-title" className="display-h1">Every player a world-forger.</h1>
          <p>The Shards is a gem: a place where any person can create their own MMORPG, and where players can step into every world that has been forged.</p>
          <div className="button-row">
            <a className="btn btn-fill" href="#playtest">Join the playtest</a>
            <Link className="btn btn-outline" to="/download">Get the launcher</Link>
          </div>
          <div className="muted">Closed waves. No spam, one mail per wave.</div>
        </div>
      </section>

      <section id="playtest" className="band band-both" aria-labelledby="playtest-title">
        <div className="container section-inner">
          <div className="section-head">
            <h2 id="playtest-title" className="display-h2">Join the playtest</h2>
            <p>Sign up with our Google Form. Closed waves. No spam, one mail per wave. Wave one runs from March 10 to April 1, 2027.</p>
          </div>
          <div className="card-row">
            <div className="card on-bg shadow pad-32 wide">
              <div className="card-title">Sign up on Google Forms</div>
              <div className="body">Closed waves. No spam, one mail per wave.</div>
              <a className="btn btn-fill self-start" href="https://forms.gle/JztENTASrQ2obUgK8" target="_blank" rel="noopener noreferrer">Open the signup form</a>
              <div className="muted">By signing up you agree to the <a href="#legal">Terms and Conditions</a> and the <a href="#legal">Privacy Policy</a>.</div>
            </div>
            <div className="card pad-32">
              <div className="card-title">What to expect</div>
              <div className="body">Enter realms, fight enemies, gather materials and leave with your loot. Hatch, raise and trade companions.</div>
              <div className="body">Wave one runs for about three weeks, from March 10 to April 1, 2027.</div>
              <div className="body">Send feedback on our <a href="https://discord.gg/fsArCAUU5" target="_blank" rel="noopener noreferrer">Discord</a>. The team approves join requests.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="download" className="container" aria-labelledby="download-title">
        <div className="section-head">
          <h2 id="download-title" className="display-h2">Download the launcher</h2>
          <p>Download the launcher to play. The game is only available for Windows right now.</p>
        </div>
        <div className="card-row gap-24">
          <div className="card on-panel shadow pad-28 download">
            <div className="card-title">Windows</div>
            <div className="body">Log in to download the launcher. New here? Create an account with your invitation code.</div>
            <div className="button-row">
              <Link className="btn btn-fill" to="/login">Log in</Link>
              <Link className="btn btn-outline" to="/signup">Create account</Link>
            </div>
          </div>
        </div>
        <div className="card pad-28">
          <div className="card-title">System requirements</div>
          <div className="body">Windows 10 or 11, 64-bit. A graphics card that supports OpenGL 3.3. About 250 MB of free disk space. 1 GB of RAM. An internet connection: the game is online only.</div>
        </div>
      </section>

      <section id="legal" className="band" aria-labelledby="legal-title">
        <div className="container section-inner">
          <div className="section-head">
            <h2 id="legal-title" className="display-h2">Terms and policies</h2>
            <p>Read these before you play. Each document opens as a PDF.</p>
          </div>
          <div className="card-row gap-24">
            {LEGAL.map((name) => (
              <div key={name} className="card on-bg pad-28">
                <div className="card-title">{name}</div>
                <div className="muted">Coming soon</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
