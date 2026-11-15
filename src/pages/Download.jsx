import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { FormAlert } from '../components/FormParts.jsx';
import { usePageTitle } from '../components/usePageTitle.js';
import { useSession } from '../lib/account/SessionContext.jsx';
import { formatSizeMB } from '../lib/account/account.js';
import { go } from '../lib/account/navigate.js';

export default function Download() {
  usePageTitle('Download - The Shards');
  const { api, session, logout } = useSession();
  const [info, setInfo] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const signedIn = Boolean(session);

  useEffect(() => {
    if (!signedIn) return undefined;
    let live = true;
    api.launcherInfo().then(
      (data) => { if (live) setInfo(data); },
      (err) => {
        if (!live) return;
        if (err.kind === 'unauthorized') logout(); // the api already dropped the token; the redirect below sends the player to log in
        else setProblem(err.message);
      },
    );
    return () => { live = false; };
  }, [api, signedIn, logout]);

  if (!session) return <Navigate to="/login?next=/download" replace />;

  async function download() {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      go(await api.launcherDownloadUrl());
      setStarted(true);
    } catch (err) {
      if (err.kind === 'unauthorized') {
        logout();
        return;
      }
      setProblem(err.message);
    }
    setBusy(false);
  }

  return (
    <Layout prose>
      <section className="intro" aria-labelledby="download-page-title">
        <div className="badge">WINDOWS</div>
        <h1 id="download-page-title" className="display-h1">Download the launcher.</h1>
        <p>Logged in as <span className="em">{session.username}</span>. The game is only available for Windows right now.</p>
      </section>

      <section aria-labelledby="launcher-title">
        <h2 id="launcher-title" className="display-h2">The launcher</h2>
        <div className="card on-panel shadow pad-28 form-card">
          <FormAlert message={problem} />
          {info ? (
            <>
              <div className="body">Launcher v<span className="em">{info.version}</span> / <span className="em">{formatSizeMB(info.size)}</span></div>
              <div className="muted break">SHA-256: <span id="launcher-sha256">{info.sha256}</span></div>
            </>
          ) : problem ? null : <div className="muted" role="status">Looking for the launcher...</div>}
          <div className="button-row">
            <button className="btn btn-fill" type="button" onClick={download} disabled={busy || !info}>{busy ? 'Preparing...' : 'Download for Windows'}</button>
            <button className="btn btn-outline" type="button" onClick={logout}>Log out</button>
          </div>
          {started ? <div className="muted" role="status">Your download is starting. If nothing happens, press the button again.</div> : null}
        </div>
      </section>

      <section aria-labelledby="unsigned-title">
        <h2 id="unsigned-title" className="display-h2">Before you run it</h2>
        <div className="card pad-28">
          <div className="body">The launcher is not code-signed yet, so Windows may say <span className="em">unknown publisher</span>. Choose <span className="em">More info</span>, then <span className="em">Run anyway</span>. To be sure the file is the one we published, compare its SHA-256 (shown above) with the file you downloaded.</div>
        </div>
        <div className="card pad-28">
          <div className="card-title">System requirements</div>
          <div className="body">Windows 10 or 11, 64-bit. A graphics card that supports OpenGL 3.3. About 250 MB of free disk space. 1 GB of RAM. An internet connection: the game is online only.</div>
        </div>
      </section>
    </Layout>
  );
}
