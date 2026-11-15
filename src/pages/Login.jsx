import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { Field, FormAlert } from '../components/FormParts.jsx';
import { usePageTitle } from '../components/usePageTitle.js';
import { useSession } from '../lib/account/SessionContext.jsx';
import { safeNext } from '../lib/account/account.js';

export default function Login() {
  usePageTitle('Log in - The Shards');
  const { login } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const found = {};
    if (!form.username.trim()) found.username = 'Enter your username.';
    if (!form.password) found.password = 'Enter your password.';
    setErrors(found);
    if (Object.keys(found).length) {
      setFailure('Fix the fields marked below.');
      return;
    }
    setFailure('');
    setBusy(true);
    try {
      await login({ username: form.username.trim(), password: form.password });
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setFailure(err.message);
      setBusy(false);
    }
  }

  return (
    <Layout prose>
      <section className="intro" aria-labelledby="login-title">
        <div className="badge">ACCOUNT</div>
        <h1 id="login-title" className="display-h1">Log in.</h1>
        <p>Log in to download the Windows launcher.</p>
      </section>

      <section aria-labelledby="login-form-title">
        <h2 id="login-form-title" className="display-h2">Your account</h2>
        <form className="card on-panel pad-28 form-card" onSubmit={submit} noValidate>
          <FormAlert message={failure} />
          <Field id="username" label="Username" error={errors.username} type="text" name="username"
            autoComplete="username" autoCapitalize="none" spellCheck="false" value={form.username} onChange={set('username')} />
          <Field id="password" label="Password" error={errors.password} type="password" name="password"
            autoComplete="current-password" value={form.password} onChange={set('password')} />
          <button className="btn btn-fill self-start" type="submit" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
          <div className="muted">New here? <Link className="link-row" to="/signup">Create an account</Link> with your invitation code.</div>
        </form>
      </section>
    </Layout>
  );
}
