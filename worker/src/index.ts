// Worker entry (S3): /api/* runs the Hono app; pages defer to Static Assets
// (SPA fallback via the ASSETS binding — required when Worker code exists).
import app from "./app.ts";
import type { WorkerEnv } from "./config.ts";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return app.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
