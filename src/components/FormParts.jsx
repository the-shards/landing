// Small pieces shared by the signup and login forms.

// One labelled input with an optional hint. `error` is the field's message (shown with [X], not colour alone).
export function Field({ id, label, hint, error, ...input }) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...input} />
      {hint ? <div id={`${id}-hint`} className="hint">{hint}</div> : null}
      {error ? <div id={`${id}-error`} className="field-error">[X] {error}</div> : null}
    </div>
  );
}

// The form-level problem, announced to screen readers. Nothing is rendered when there is none.
export function FormAlert({ message }) {
  if (!message) return null;
  return <div className="form-error" role="alert">[X] {message}</div>;
}
