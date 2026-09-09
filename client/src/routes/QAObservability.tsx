// QA/local-preview observability cockpit (NFR-004/NFR-005/NFR-006).
// Only client-observed metadata is retained. Response bodies, credentials,
// cookies, workspace IDs, and exercise inputs never enter the trace timeline.
import { useEffect, useState } from "react";

interface QaConfig {
  enabled: boolean;
  environment: string;
  logViews: { cloudflare?: string; grafana?: string };
}

interface TraceEntry {
  id: string;
  label: string;
  method: string;
  path: string;
  status: number | null;
  durationMs: number;
  correlationId?: string;
  errorCode?: string;
  outcome: "passed" | "failed";
  recordedAt: string;
}

interface ObservedResponse {
  status: number | null;
  durationMs: number;
  correlationId?: string;
  errorCode?: string;
  body: unknown;
}

interface Selection {
  eventSlug: string;
  eventSessionId: string;
  ticketTypeId: string;
}

interface CatalogBody {
  data?: Array<{ slug?: unknown; availabilityStatus?: unknown }>;
}

interface DetailBody {
  data?: {
    sessions?: Array<{ id?: unknown; bookable?: unknown }>;
    ticketTypes?: Array<{ id?: unknown; eventSessionId?: unknown }>;
  };
}

const TRACE_KEY = "ebp.qa-observability.trace";
const MAX_TRACE_ENTRIES = 50;
const DECLINE_INPUT = ["SIMULATE", "DECLINE"].join("-");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function responseCode(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined;
  return typeof body.error.code === "string" ? body.error.code : undefined;
}

function responseCorrelation(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined;
  return typeof body.error.correlationId === "string" ? body.error.correlationId : undefined;
}

function readTrace(): TraceEntry[] {
  try {
    const raw = window.sessionStorage.getItem(TRACE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TraceEntry => {
      if (!isRecord(item)) return false;
      return typeof item.id === "string" && typeof item.label === "string" &&
        typeof item.method === "string" && typeof item.path === "string" &&
        (typeof item.status === "number" || item.status === null) &&
        typeof item.durationMs === "number" &&
        (item.outcome === "passed" || item.outcome === "failed") &&
        typeof item.recordedAt === "string";
    });
  } catch {
    return [];
  }
}

function formatReference(result: Pick<ObservedResponse, "errorCode" | "correlationId">): string | undefined {
  if (!result.errorCode) return undefined;
  return result.correlationId ? `${result.errorCode} (reference ${result.correlationId})` : result.errorCode;
}

async function requestJson(
  path: string,
  init: RequestInit = {},
  allowProvision = true,
): Promise<ObservedResponse> {
  const startedAt = performance.now();
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");

  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers,
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    const errorCode = responseCode(body);
    const correlationId = response.headers.get("x-correlation-id") ?? responseCorrelation(body);

    if (
      allowProvision &&
      (response.status === 401 || response.status === 410) &&
      (errorCode === "WORKSPACE_REQUIRED" || errorCode === "WORKSPACE_EXPIRED")
    ) {
      const provisioned = await requestJson(
        "/api/workspaces/provision",
        { method: "POST", body: "{}" },
        false,
      );
      if (provisioned.status !== 200) return { status: response.status, durationMs: elapsed(startedAt), correlationId, errorCode, body };
      return {
        ...(await requestJson(path, init, false)),
        durationMs: elapsed(startedAt),
      };
    }

    return { status: response.status, durationMs: elapsed(startedAt), correlationId, errorCode, body };
  } catch {
    return { status: null, durationMs: elapsed(startedAt), errorCode: "NETWORK_ERROR", body: null };
  }
}

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function selectionFromBodies(catalogBody: unknown, detailBody: unknown): Selection | null {
  const catalog = catalogBody as CatalogBody;
  const event = catalog.data?.find((item) => item.availabilityStatus === "AVAILABLE" && typeof item.slug === "string");
  if (!event || typeof event.slug !== "string") return null;
  const detail = detailBody as DetailBody;
  const session = detail.data?.sessions?.find((item) => item.bookable === true && typeof item.id === "string");
  if (!session || typeof session.id !== "string") return null;
  const ticket = detail.data?.ticketTypes?.find(
    (item) => item.eventSessionId === session.id && typeof item.id === "string",
  );
  if (!ticket || typeof ticket.id !== "string") return null;
  return { eventSlug: event.slug, eventSessionId: session.id, ticketTypeId: ticket.id };
}

export function QAObservability() {
  const [config, setConfig] = useState<QaConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [trace, setTrace] = useState<TraceEntry[]>(readTrace);
  const [email, setEmail] = useState("alex.attendee@example.test");
  const [password, setPassword] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/qa/config", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("config unavailable");
        return (await response.json()) as QaConfig;
      })
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch(() => {
        if (!cancelled) setConfigError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const appendTrace = (label: string, method: string, path: string, result: ObservedResponse) => {
    const entry: TraceEntry = {
      id: crypto.randomUUID(),
      label,
      method,
      path,
      status: result.status,
      durationMs: result.durationMs,
      ...(result.correlationId ? { correlationId: result.correlationId } : {}),
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      outcome: result.status !== null && result.status >= 200 && result.status < 300 ? "passed" : "failed",
      recordedAt: new Date().toISOString(),
    };
    setTrace((current) => {
      const next = [...current, entry].slice(-MAX_TRACE_ENTRIES);
      try {
        window.sessionStorage.setItem(TRACE_KEY, JSON.stringify(next));
      } catch {
        // A blocked session store must not prevent QA evidence from rendering.
      }
      return next;
    });
    return entry;
  };

  const runHealth = async () => {
    const result = await requestJson("/api/health");
    appendTrace("Health", "GET", "/api/health", result);
  };

  const runDiscovery = async (): Promise<Selection | null> => {
    const catalog = await requestJson("/api/events");
    appendTrace("Event discovery", "GET", "/api/events", catalog);
    if (catalog.status !== 200) return null;
    const catalogData = catalog.body as CatalogBody;
    const event = catalogData.data?.find((item) => item.availabilityStatus === "AVAILABLE" && typeof item.slug === "string");
    if (!event || typeof event.slug !== "string") return null;

    const detailPath = `/api/events/${encodeURIComponent(event.slug)}`;
    const detail = await requestJson(detailPath);
    appendTrace("Event detail", "GET", detailPath, detail);
    if (detail.status !== 200) return null;
    const next = selectionFromBodies(catalog.body, detail.body);
    setSelection(next);
    return next;
  };

  const runSignIn = async () => {
    const result = await requestJson("/api/session", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    appendTrace("Sign in", "POST", "/api/session", result);
    setPassword("");
  };

  const runDecline = async (knownSelection = selection) => {
    if (!knownSelection) return;
    const result = await requestJson("/api/checkout", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        eventSlug: knownSelection.eventSlug,
        eventSessionId: knownSelection.eventSessionId,
        ticketTypeId: knownSelection.ticketTypeId,
        quantity: 1,
        paymentCode: DECLINE_INPUT,
      }),
    });
    appendTrace("Payment decline", "POST", "/api/checkout", result);
  };

  const runAll = async () => {
    if (running) return;
    setRunning(true);
    try {
      await runHealth();
      const nextSelection = await runDiscovery();
      await runSignIn();
      await runDecline(nextSelection);
    } finally {
      setRunning(false);
    }
  };

  const clearTrace = () => {
    setTrace([]);
    try {
      window.sessionStorage.removeItem(TRACE_KEY);
    } catch {
      // Ignore storage policy failures; the in-memory timeline is cleared.
    }
  };

  return (
    <>
      <section className="page-heading compact-heading" aria-labelledby="qa-observability-heading">
        <p className="eyebrow">QA / local-preview</p>
        <h1 id="qa-observability-heading">QA observability cockpit</h1>
        <p className="lede">
          Exercise representative requests and collect browser-safe evidence for a manual QA run. This page never loads server logs.
        </p>
      </section>

      {config === null && !configError && <div className="skeleton-card skeleton-detail" aria-busy="true" aria-label="Loading QA configuration" />}
      {configError && (
        <div className="state-card error" role="alert">
          <p className="eyebrow">QA cockpit unavailable</p>
          <h2>Configuration could not be read.</h2>
          <p>Reference: QA_CONFIG_UNAVAILABLE</p>
        </div>
      )}
      {config && !config.enabled && (
        <div className="state-card" role="status">
          <p className="eyebrow">Disabled by deployment policy</p>
          <h2>This cockpit is not enabled here.</h2>
          <p>
            The {config.environment} deployment does not expose QA exercises. Enable it only for an explicitly scoped local or preview run.
          </p>
        </div>
      )}
      {config?.enabled && (
        <>
          <div className="notice qa-safety-note" role="note">
            Client evidence below contains status, duration, response code, correlation ID, and safe error references only. Passwords, cookies, workspace secrets, payment inputs, and raw server logs are excluded.
          </div>

          <div className="qa-layout">
            <section className="surface qa-exercises" aria-labelledby="qa-exercises-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Request exercises</p>
                  <h2 id="qa-exercises-heading">Run a safe journey</h2>
                </div>
                <button className="button button-primary button-small" type="button" onClick={() => void runAll()} disabled={running}>
                  {running ? "Running…" : "Run all"}
                </button>
              </div>
              <p className="muted">
                Exercises use the seeded local/preview workspace. Browser cookies stay managed by the browser and are never read into this page.
              </p>
              <div className="qa-action-list">
                <button className="button button-secondary" type="button" onClick={() => void runHealth()} disabled={running}>
                  Run health
                </button>
                <button className="button button-secondary" type="button" onClick={() => void runDiscovery()} disabled={running}>
                  Run event discovery
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!running) void runSignIn();
                }}
              >
                <p className="eyebrow qa-form-label">Transient sign-in exercise</p>
                <div className="field">
                  <label htmlFor="qa-email">Seeded email</label>
                  <input id="qa-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="qa-password">Password (not stored)</label>
                  <input
                    id="qa-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <button className="button button-secondary" type="submit" disabled={running || password.length === 0}>
                  Run sign in
                </button>
                <p className="form-note">The masked value is sent for this request only, then cleared.</p>
              </form>
              <button className="button button-secondary" type="button" onClick={() => void runDecline()} disabled={running || !selection}>
                Run payment decline
              </button>
              {!selection && <p className="form-note">Run event discovery before the decline exercise.</p>}
            </section>

            <section className="surface qa-links" aria-labelledby="qa-links-heading">
              <p className="eyebrow">External log evidence</p>
              <h2 id="qa-links-heading">Provider-held views</h2>
              <p className="muted">
                These are configured links only. Open them to search the correlation ID in Cloudflare Workers Logs or Grafana; the cockpit does not proxy or display their contents.
              </p>
              <div className="qa-link-list">
                {config.logViews.cloudflare && (
                  <a className="button button-secondary" href={config.logViews.cloudflare} target="_blank" rel="noreferrer">
                    Cloudflare Workers Logs
                  </a>
                )}
                {config.logViews.grafana && (
                  <a className="button button-secondary" href={config.logViews.grafana} target="_blank" rel="noreferrer">
                    Grafana log view
                  </a>
                )}
              </div>
              {!config.logViews.cloudflare && !config.logViews.grafana && <p className="form-note">No external viewer links are configured for this environment.</p>}
            </section>
          </div>

          <section className="surface qa-trace" aria-labelledby="qa-trace-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Browser-session evidence</p>
                <h2 id="qa-trace-heading">Trace timeline</h2>
              </div>
              <button className="button button-secondary button-small" type="button" onClick={clearTrace} disabled={trace.length === 0}>
                Clear timeline
              </button>
            </div>
            {trace.length === 0 ? (
              <p className="muted">No exercises recorded in this browser session.</p>
            ) : (
              <ol className="qa-trace-list">
                {trace.map((entry) => (
                  <li className="qa-trace-item" key={entry.id}>
                    <div className="qa-trace-topline">
                      <strong>{entry.label}</strong>
                      <span className={`status-badge ${entry.outcome === "passed" ? "status-available" : "status-sold-out"}`}>
                        {entry.outcome}
                      </span>
                    </div>
                    <dl className="detail qa-trace-detail">
                      <div className="detail-item"><dt>Request</dt><dd><code>{entry.method} {entry.path}</code></dd></div>
                      <div className="detail-item"><dt>Response</dt><dd>{entry.status ?? "network error"}</dd></div>
                      <div className="detail-item"><dt>Duration</dt><dd>{entry.durationMs} ms</dd></div>
                      <div className="detail-item"><dt>Correlation ID</dt><dd><code>{entry.correlationId ?? "not returned"}</code></dd></div>
                      {entry.errorCode && <div className="detail-item"><dt>Safe error reference</dt><dd>{formatReference(entry)}</dd></div>}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  );
}
