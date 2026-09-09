import { useEffect, useRef, useState } from "react";
import { navigate } from "../router.tsx";
import { ApiError, errorReference, getAttendee, safeNextPath, signIn } from "../lib/api.ts";

// Sign-in route (ACC-001, UF-002; UI-DESIGN §3.3, §6).
// One non-enumerating error summary (role=alert), focus moved to it on
// failure, email preserved. Safe same-origin ?next= only.
export function SignIn() {
  const [email, setEmail] = useState("alex.attendee@example.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const existing = getAttendee();

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      navigate(next);
    } catch (err) {
      setError(err instanceof ApiError ? `${errorReference(err)}: ${err.message}` : "UNEXPECTED_ERROR");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-intro" aria-labelledby="signin-heading">
        <p className="eyebrow">Attendee and organizer access</p>
        <h1 id="signin-heading">Sign in</h1>
        <p className="lede">
          Keep your event plans, booking references, and confirmation details in one place.
        </p>
        <ul className="feature-list">
          <li>Browse published events without creating an account.</li>
          <li>Use a seeded attendee or organizer account to explore the product.</li>
          <li>Return to your confirmed booking whenever you need it.</li>
        </ul>
      </section>
      <section className="surface auth-card" aria-label="Sign-in form">
        <aside className="notice" aria-labelledby="demo-credentials-heading">
          <strong id="demo-credentials-heading">Demo credentials</strong>
          <p>Use a seeded account to explore the attendee or organizer journey:</p>
          <ul>
            <li><code>alex.attendee@example.test</code> · attendee_alex</li>
            <li><code>maya.attendee@example.test</code> · attendee_maya</li>
            <li><code>raka.organizer@example.test</code> · organizer_raka</li>
          </ul>
          <p className="form-note">Use the documented seeded password from the QA test-data guide.</p>
        </aside>
        {existing && (
          <p className="notice">
            Signed in as {existing.displayName} ({existing.email}).
          </p>
        )}
        {error && (
          <div
            id="signin-error"
            className="error form-error"
            role="alert"
            tabIndex={-1}
            ref={alertRef}
            aria-live="assertive"
          >
            <p>Could not sign in ({error}). Check your details and try again.</p>
          </div>
        )}
        <form onSubmit={submit} aria-describedby={error ? "signin-error signin-help" : "signin-help"}>
          <div className="field">
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={error ? "signin-error signin-help" : "signin-help"}
            />
          </div>
          <div className="field">
            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? "signin-error signin-help" : "signin-help"}
            />
          </div>
          <button className="button button-primary button-wide" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p id="signin-help" className="form-note">
          Demo accounts are workspace-scoped public data: alex.attendee@example.test and maya.attendee@example.test.
        </p>
      </section>
    </div>
  );
}
