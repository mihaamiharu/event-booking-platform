// QA cockpit policy and safe external-link shaping (NFR-004/NFR-005/NFR-006).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { qaObservabilityConfig, qaObservabilityEnabled } from "../../worker/src/qa.ts";

describe("nfr-004/nfr-005/nfr-006 QA observability policy", () => {
  it("enables local and preview while keeping production opt-in", () => {
    assert.equal(qaObservabilityEnabled({ DEPLOYMENT_ENV: "local" }), true);
    assert.equal(qaObservabilityEnabled({ DEPLOYMENT_ENV: "preview" }), true);
    assert.equal(qaObservabilityEnabled({}), false);
    assert.equal(qaObservabilityEnabled({ DEPLOYMENT_ENV: "production" }), false);
    assert.equal(
      qaObservabilityEnabled({ DEPLOYMENT_ENV: "production", QA_OBSERVABILITY_ENABLED: "true" }),
      true,
    );
    assert.equal(
      qaObservabilityEnabled({ DEPLOYMENT_ENV: "preview", QA_OBSERVABILITY_ENABLED: "false" }),
      false,
    );
  });

  it("returns only safe, configured HTTP(S) log links", () => {
    assert.deepEqual(
      qaObservabilityConfig({
        DEPLOYMENT_ENV: "preview",
        QA_CLOUDFLARE_LOGS_URL: "https://logs.example.test/workers",
        QA_GRAFANA_URL: "https://user:password@grafana.example.test/explore?token=not-safe",
      }),
      {
        enabled: true,
        environment: "preview",
        logViews: { cloudflare: "https://logs.example.test/workers" },
      },
    );
  });

  it("does not expose configured links while production is disabled", () => {
    assert.deepEqual(
      qaObservabilityConfig({
        DEPLOYMENT_ENV: "production",
        QA_CLOUDFLARE_LOGS_URL: "https://logs.example.test/workers",
      }),
      { enabled: false, environment: "production", logViews: {} },
    );
  });
});
