import { useEffect, useState } from "react";
import { ApiError, api, clearAttendee } from "../lib/api.ts";
import { StatusBadge } from "../components/StatusBadge.tsx";

// Workspace controls (WSP-002/003, UF-001; UI-DESIGN §3.7). Status card plus
// explicit-confirm reset. Reset wipes this workspace's sessions, so the local
// attendee marker is cleared on success.
interface Status {
  workspace: {
    status: string;
    seedVersion: string;
    seedReferenceAt: string;
    expiresAt: string;
    lastActiveAt: string;
  };
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; status: Status["workspace"]; notice?: string }
  | { kind: "error"; code: string; retry: () => void };

function daysRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000));
}

export function Demo() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ kind: "loading" });
      try {
        const res = await api<Status>("/api/workspaces/status");
        if (!cancelled) setState({ kind: "ready", status: res.workspace });
      } catch (e) {
        if (!cancelled) {
          setState({
            kind: "error",
            code: e instanceof ApiError ? e.code : "UNEXPECTED_ERROR",
            retry: load,
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm || resetting) return;
    setResetting(true);
    setResetError(null);
    try {
      await attemptReset();
    } catch (err) {
      if (err instanceof ApiError && err.code === "TURNSTILE_REQUIRED") {
        const { requestChallengeToken } = await import("../lib/turnstile.ts");
        const token = await requestChallengeToken();
        if (token) {
          try {
            await attemptReset(token);
          } catch (retryErr) {
            setResetError(
              retryErr instanceof ApiError ? `${retryErr.code}: ${retryErr.message}` : "UNEXPECTED_ERROR",
            );
          }
        }
      } else {
        setResetError(err instanceof ApiError ? `${err.code}: ${err.message}` : "UNEXPECTED_ERROR");
      }
    } finally {
      setResetting(false);
    }
  };

  const attemptReset = async (turnstileToken?: string) => {
    const res = await api<Status>("/api/workspaces/reset", {
      method: "POST",
      body: JSON.stringify(turnstileToken ? { confirm: true, turnstileToken } : { confirm: true }),
    });
    clearAttendee();
    setConfirm(false);
    setState({
      kind: "ready",
      status: res.workspace,
      notice: `Workspace reset to seed state at ${res.workspace.seedReferenceAt}. All sessions signed out.`,
    });
  };

  return (
    <>
      <div className="page-heading compact-heading">
        <p className="eyebrow">Workspace utilities</p>
        <h1>Demo controls</h1>
        <p className="lede">Keep this temporary workspace predictable while you explore the attendee journey.</p>
      </div>
      {state.kind === "loading" && <div className="skeleton-card skeleton-detail" aria-busy="true" aria-label="Loading workspace" />}
      {state.kind === "error" && (
        <div className="state-card error" role="alert">
          <p>Reference: {state.code}</p>
          <button className="button button-secondary" type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <div className="demo-layout">
          <section className="surface status-card" aria-labelledby="workspace-status-heading">
            <div className="card-topline">
              <div>
                <p className="eyebrow">Workspace status</p>
                <h2 id="workspace-status-heading">Your private demo space</h2>
              </div>
              <StatusBadge tone={state.status.status === "ACTIVE" ? "available" : "neutral"}>
                {state.status.status}
              </StatusBadge>
            </div>
            <dl className="detail status-detail">
              <div className="detail-item">
                <dt>Seed version</dt>
                <dd>{state.status.seedVersion}</dd>
              </div>
              <div className="detail-item">
                <dt>Provisioned</dt>
                <dd>{state.status.seedReferenceAt}</dd>
              </div>
              <div className="detail-item">
                <dt>Expires</dt>
                <dd>{state.status.expiresAt}</dd>
              </div>
              <div className="detail-item">
                <dt>Time remaining</dt>
                <dd>{daysRemaining(state.status.expiresAt)} days remaining</dd>
              </div>
            </dl>
          </section>
          <section className="surface reset-card" aria-labelledby="reset-heading">
            <p className="eyebrow">Start fresh</p>
            <h2 id="reset-heading">Reset this workspace</h2>
            <p className="muted">
              Reset restores the accounts, events, ticket availability, and bookings to seed state. Other workspaces are never affected.
            </p>
            {state.notice && <div className="confirmation-panel compact-panel" role="status"><p>{state.notice}</p></div>}
            {resetError && (
              <div className="error form-error" role="alert">
                <p>Reset failed ({resetError}). Workspace state is unknown — retry.</p>
              </div>
            )}
            <form onSubmit={reset}>
              <label className="confirm-row">
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <span>I understand reset deletes this workspace&apos;s bookings and signs out all sessions.</span>
              </label>
              <button className="button button-danger button-wide" type="submit" disabled={!confirm || resetting}>
                {resetting ? "Resetting…" : "Reset workspace"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
