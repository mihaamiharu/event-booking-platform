// S1 worker entry (NFR-001): routing + GET /api/health only.
// No product behavior beyond health; S3 adds the API surface.
import { seedVersion, type WorkerEnv } from "./config.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ status: "ok", seedVersion: seedVersion(env) });
    }
    // S1-internal 404 shape; stable contract codes (§6) apply from S3.
    return json({ error: { code: "NOT_FOUND" } }, 404);
  },
};
