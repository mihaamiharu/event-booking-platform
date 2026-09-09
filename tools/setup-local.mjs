// Prepare the ignored local development environment.
import { ensureDevVars, runLocalWrangler } from "./local-runtime.mjs";

ensureDevVars();
runLocalWrangler(["d1", "migrations", "apply", "DB"], { stdio: "inherit" });
runLocalWrangler(
  ["d1", "execute", "DB", "--command", "DELETE FROM rate_counters;"],
  { stdio: "inherit" },
);
