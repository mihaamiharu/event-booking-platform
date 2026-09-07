import { useEffect, useState } from "react";
import { ApiError, api, clearAttendee } from "../lib/api.ts";

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
      const res = await api<Status>("/api/workspaces/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      clearAttendee();
      setConfirm(false);
      setState({
        kind: "ready",
        status: res.workspace,
        notice: `Workspace reset to seed state at ${res.workspace.seedReferenceAt}. All sessions signed out.`,
      });
    } catch (err) {
      setResetError(err instanceof ApiError ? `${err.code}: ${err.message}` : "UNEXPECTED_ERROR");
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <h1>Demo controls</h1>
      {state.kind === "loading" && (
        <div className="skeleton" aria-busy="true">
          <div aria-hidden="true">Loading workspace…</div>
        </div>
      )}
      {state.kind === "error" && (
        <div className="error" role="alert">
          <p>Could not load workspace ({state.code}).</p>
          <button type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          {state.notice && (
            <div className="empty" role="status">
              <p>{state.notice}</p>
            </div>
          )}
          <dl className="detail">
            <div>
              <dt>Status</dt>
              <dd>{state.status.status}</dd>
            </div>
            <div>
              <dt>Seed version</dt>
              <dd>{state.status.seedVersion}</dd>
            </div>
            <div>
              <dt>Provisioned</dt>
              <dd>{state.status.seedReferenceAt}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                {state.status.expiresAt} ({daysRemaining(state.status.expiresAt)} days remaining)
              </dd>
            </div>
          </dl>
          <p className="muted">
            Reset restores this workspace only — accounts, events, and capacity return to seed
            state. Other workspaces are never affected.
          </p>
          {resetError && (
            <div className="error" role="alert">
              <p>Reset failed ({resetError}). Workspace state is unknown — retry.</p>
            </div>
          )}
          <form onSubmit={reset}>
            <div className="field">
              <label className="radio">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                I understand reset deletes this workspace's bookings and signs out all sessions.
              </label>
            </div>
            <button type="submit" disabled={!confirm || resetting}>
              {resetting ? "Resetting…" : "Reset workspace"}
            </button>
          </form>
        </>
      )}
    </>
  );
}
