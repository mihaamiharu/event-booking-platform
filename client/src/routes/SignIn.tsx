import { useEffect, useRef, useState } from "react";
import { navigate } from "../router.tsx";
import { ApiError, getAttendee, safeNextPath, signIn } from "../lib/api.ts";

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
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : "UNEXPECTED_ERROR");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1>Sign in</h1>
      {existing && (
        <p className="muted">
          Signed in as {existing.displayName} ({existing.email}).
        </p>
      )}
      {error && (
        <div
          id="signin-error"
          className="error"
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
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p id="signin-help" className="muted">
        Demo accounts (workspace-scoped, public demo data): alex.attendee@example.test /
        maya.attendee@example.test.
      </p>
    </>
  );
}
