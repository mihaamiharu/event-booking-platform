// Hono application wiring (S3, ADR-0006).
// Only /api/* invokes dynamic code; everything else 404s (Static Assets
// serve the client in front of this worker — never run_worker_first).
import { Hono } from "hono";
import type { WorkerEnv } from "./config.ts";
import { first, newMeta } from "./db.ts";
import { err } from "./errors.ts";
import {
  emitLog,
  newCorrelationId,
  workspacePseudonym,
} from "./logger.ts";
import { bookings } from "./routes/bookings.ts";
import { checkout } from "./routes/checkout.ts";
import { events } from "./routes/events.ts";
import { session } from "./routes/session.ts";
import { workspaces } from "./routes/workspaces.ts";
import { qaObservabilityConfig } from "./qa.ts";
import {
  getCookie,
  isExpired,
  verifyWorkspace,
  type WorkspaceRow,
} from "./workspace.ts";

export interface AppContext {
  Bindings: WorkerEnv;
  Variables: {
    workspace: WorkspaceRow;
    requestContext: { correlationId: string; startedAt: number };
  };
}

const app = new Hono<AppContext>();

function normalizedRoute(path: string): string {
  return path
    .replace(/\/BKG-[^/]+$/, "/:reference")
    .replace(/\/events\/[^/]+$/, "/events/:slug");
}

// Every dynamic request has one correlation ID shared by logs, headers, and
// error bodies. The workspace pseudonym is added only after the scope
// middleware has resolved it, so missing-workspace failures remain safe.
app.use("/api/*", async (c, next) => {
  const correlationId = newCorrelationId();
  const startedAt = performance.now();
  c.set("requestContext", { correlationId, startedAt });

  try {
    await next();
  } catch (error) {
    emitLog({
      event: "worker.exception",
      timestamp: new Date().toISOString(),
      correlationId,
      method: c.req.method,
      route: normalizedRoute(c.req.path),
      message: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }

  const response = c.res;
  const responseCorrelationId = response.headers.get("x-correlation-id") ?? correlationId;
  try {
    response.headers.set("x-correlation-id", responseCorrelationId);
  } catch {
    // Some runtimes expose immutable response headers; error() already set
    // the header and successful responses still retain the log ID.
  }
  const workspace = (c.var as { workspace?: WorkspaceRow }).workspace;
  emitLog({
    event: "api.request",
    timestamp: new Date().toISOString(),
    correlationId: responseCorrelationId,
    method: c.req.method,
    route: normalizedRoute(c.req.path),
    status: response.status,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    workspace: await workspacePseudonym(workspace?.id),
    errorCode: response.status >= 400 ? response.headers.get("x-error-code") ?? undefined : undefined,
  });
});

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    seedVersion: c.env.SEED_VERSION ?? "r1-v1",
  });
});

// QA cockpit configuration is deliberately available without a workspace so
// the page can explain its deployment gate before it asks the browser to
// provision or sign in. It returns only allowlisted external URLs.
app.get("/api/qa/config", (c) => c.json(qaObservabilityConfig(c.env)));

app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (path === "/api/health" || path === "/api/qa/config" || path === "/api/workspaces/provision") {
    return next();
  }
  const meta = newMeta();
  const secret = c.env.WORKSPACE_SECRET;
  if (!secret) {
    return err(500, "UNEXPECTED_ERROR", { message: "Server misconfigured." });
  }
  const cookie = getCookie(c.req.raw, "ebp_workspace");
  const wid = cookie ? await verifyWorkspace(cookie, secret) : null;
  if (!wid) {
    return err(401, "WORKSPACE_REQUIRED", { message: "Workspace required." });
  }
  const ws = await first<WorkspaceRow>(
    meta,
    c.env.DB,
    "SELECT id, seed_version, seed_reference_at, last_active_at, status FROM workspaces WHERE id = ?1",
    wid,
  );
  if (!ws || ws.status !== "ACTIVE") {
    return err(401, "WORKSPACE_REQUIRED", { message: "Workspace required." });
  }
  if (isExpired(ws.last_active_at, Date.now())) {
    return err(410, "WORKSPACE_EXPIRED", {
      message: "Workspace expired; provision a new one.",
    });
  }
  c.set("workspace", ws);
  await next();
});

app.route("/api/workspaces", workspaces);
app.route("/api/events", events);
app.route("/api/session", session);
app.route("/api/checkout", checkout);
app.route("/api/bookings", bookings);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return err(404, "NOT_FOUND", { message: "Not found." });
  }
  return c.text("Not found.", 404);
});

// With Worker code present, the SPA fallback runs through the assets
// binding (docs: static-assets/binding); see index.ts. run_worker_first
// keeps /api/* dynamic; pages stay static-first (zero Worker CPU,
// usage-model §2.1).
export default app;
