// Hono application wiring (S3, ADR-0006).
// Only /api/* invokes dynamic code; everything else 404s (Static Assets
// serve the client in front of this worker — never run_worker_first).
import { Hono } from "hono";
import type { WorkerEnv } from "./config.ts";
import { first, newMeta } from "./db.ts";
import { err } from "./errors.ts";
import { events } from "./routes/events.ts";
import { workspaces } from "./routes/workspaces.ts";
import {
  getCookie,
  isExpired,
  verifyWorkspace,
  type WorkspaceRow,
} from "./workspace.ts";

export interface AppContext {
  Bindings: WorkerEnv;
  Variables: { workspace: WorkspaceRow };
}

const app = new Hono<AppContext>();

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    seedVersion: c.env.SEED_VERSION ?? "r1-v1",
  });
});

app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (path === "/api/health" || path === "/api/workspaces/provision") {
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

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return err(404, "NOT_FOUND", { message: "Not found." });
  }
  return c.text("Not found.", 404);
});

export default app;
