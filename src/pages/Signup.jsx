import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { Field, FormAlert } from '../components/FormParts.jsx';
import { usePageTitle } from '../components/usePageTitle.js';
import { useSession } from '../lib/account/SessionContext.jsx';
import { USERNAME_RULE, PASSWORD_RULE, validateRegistration } from '../lib/account/account.js';

export default function Signup() {
  usePageTitle('Create account - The Shards');
  const { api, register } = useSession();
  const navigate = useNavigate();
  const [inviteRequired, setInviteRequired] = useState(true); // until the server says otherwise
  const [form, setForm] = useState({ username: '', password: '', confirm: '', invite: '' });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.inviteRequired().then((required) => { if (live) setInviteRequired(required); });
    return () => { live = false; };
  }, [api]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const found = validateRegistration({ ...form, inviteRequired });
    setErrors(found);
    if (Object.keys(found).length) {
      setFailure('Fix the fields marked below.');
      return;
    }
    setFailure('');
    setBusy(true);
    try {
      await register({ username: form.username, password: form.password, invite: inviteRequired ? form.invite : '' });
      navigate('/download', { replace: true });
    } catch (err) {
      setFailure(err.message);
      setBusy(false);
    }
  }

  return (
    <Layout prose>
      <section className="intro" aria-labelledby="signup-title">
        <div className="badge">ACCOUNT</div>
        <h1 id="signup-title" className="display-h1">Create your account.</h1>
        <p>You need an invitation code to sign up. With an account you can download the Windows launcher and play.</p>
      </section>

      <section aria-labelledby="signup-form-title">
        <h2 id="signup-form-title" className="display-h2">Sign up</h2>
        <form className="card on-panel pad-28 form-card" onSubmit={submit} noValidate>
          <FormAlert message={failure} />
          <Field id="username" label="Username" hint={USERNAME_RULE} error={errors.username} type="text" name="username"
            autoComplete="username" autoCapitalize="none" spellCheck="false" value={form.username} onChange={set('username')} />
          <Field id="password" label="Password" hint={PASSWORD_RULE} error={errors.password} type="password" name="password"
            autoComplete="new-password" value={form.password} onChange={set('password')} />
          <Field id="confirm" label="Confirm password" error={errors.confirm} type="password" name="confirm"
            autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          {inviteRequired ? (
            <Field id="invite" label="Invitation code" hint="Looks like XXXX-XXXX-XXXX-XXXX. Capitals and dashes are optional." error={errors.invite}
              type="text" name="invite" autoComplete="off" autoCapitalize="none" spellCheck="false" value={form.invite} onChange={set('invite')} />
          ) : null}
          <button className="btn btn-fill self-start" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create account'}</button>
          <div className="muted">Already have an account? <Link className="link-row" to="/login">Log in</Link></div>
        </form>
      </section>
    </Layout>
  );
}
