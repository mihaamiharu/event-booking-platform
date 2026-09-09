// Controlled teaching defects (NFR-005/NFR-007).
// Profiles are opt-in, deterministic, and unavailable when the deployment
// declares itself production. The canonical baseline is always "baseline".

export const SCENARIO_PROFILES = [
  "baseline",
  "bkg-capacity-bypass",
  "bkg-stale-price",
  "bkg-ownership-leak",
  "wsp-activity-frozen",
] as const;

export type ScenarioProfile = (typeof SCENARIO_PROFILES)[number];

export interface ScenarioEnv {
  DEPLOYMENT_ENV?: string;
  SCENARIO_PROFILE?: string;
  SCENARIO_PROFILES_ENABLED?: string;
}

export interface ScenarioDefinition {
  id: ScenarioProfile;
  requirement: string;
  symptom: string;
  layers: string[];
  reset: string;
}

export const SCENARIO_DEFINITIONS: readonly ScenarioDefinition[] = [
  { id: "baseline", requirement: "NFR-007", symptom: "Canonical R1 behavior; no teaching defect is active.", layers: ["all"], reset: "Normal workspace reset." },
  { id: "bkg-capacity-bypass", requirement: "BKG-002/BKG-003", symptom: "Successful checkouts can exceed capacity.", layers: ["API", "DB", "concurrency"], reset: "Reset before and after the concurrency scenario." },
  { id: "bkg-stale-price", requirement: "BKG-002", symptom: "Checkout uses an altered authoritative price snapshot.", layers: ["API", "DB", "UI"], reset: "Compare detail price with the booking item snapshot after reset." },
  { id: "bkg-ownership-leak", requirement: "BKG-004/WSP-001", symptom: "Booking detail omits attendee ownership scoping.", layers: ["API", "DB", "security"], reset: "Use two attendees in one workspace, then reset." },
  { id: "wsp-activity-frozen", requirement: "WSP-003", symptom: "Successful activity does not slide last-active time.", layers: ["API", "DB", "lifecycle"], reset: "Reset before the expiry-boundary scenario." },
];

export function activeScenarioProfile(env: ScenarioEnv): ScenarioProfile {
  if (env.DEPLOYMENT_ENV === "production") return "baseline";
  if (env.SCENARIO_PROFILES_ENABLED !== "true") return "baseline";
  return (SCENARIO_PROFILES as readonly string[]).includes(env.SCENARIO_PROFILE ?? "")
    ? env.SCENARIO_PROFILE as ScenarioProfile
    : "baseline";
}

export function scenarioEnabled(env: ScenarioEnv, profile: Exclude<ScenarioProfile, "baseline">): boolean {
  return activeScenarioProfile(env) === profile;
}
