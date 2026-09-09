import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCENARIO_DEFINITIONS,
  activeScenarioProfile,
  scenarioEnabled,
} from "../../worker/src/scenario.ts";

describe("nfr-005 controlled scenario profiles", () => {
  it("keeps baseline and production safe", () => {
    assert.equal(activeScenarioProfile({}), "baseline");
    assert.equal(
      activeScenarioProfile({
        DEPLOYMENT_ENV: "production",
        SCENARIO_PROFILES_ENABLED: "true",
        SCENARIO_PROFILE: "bkg-capacity-bypass",
      }),
      "baseline",
    );
  });

  it("requires explicit opt-in outside production", () => {
    assert.equal(activeScenarioProfile({ DEPLOYMENT_ENV: "local", SCENARIO_PROFILE: "bkg-stale-price" }), "baseline");
    assert.equal(
      activeScenarioProfile({
        DEPLOYMENT_ENV: "local",
        SCENARIO_PROFILES_ENABLED: "true",
        SCENARIO_PROFILE: "bkg-stale-price",
      }),
      "bkg-stale-price",
    );
    assert.equal(scenarioEnabled({ DEPLOYMENT_ENV: "preview", SCENARIO_PROFILES_ENABLED: "true", SCENARIO_PROFILE: "bkg-ownership-leak" }, "bkg-ownership-leak"), true);
  });

  it("documents a detection and reset contract for every profile", () => {
    assert.ok(SCENARIO_DEFINITIONS.length >= 4);
    for (const definition of SCENARIO_DEFINITIONS) {
      assert.ok(definition.requirement);
      assert.ok(definition.symptom);
      assert.ok(definition.layers.length > 0);
      assert.ok(definition.reset);
    }
  });
});
