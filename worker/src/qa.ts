// QA observability cockpit configuration (NFR-004/NFR-005/NFR-006).
// The Worker exposes configuration only; it never exposes logs, credentials,
// cookies, workspace secrets, or exercise payloads.

export interface QaObservabilityEnv {
  DEPLOYMENT_ENV?: string;
  QA_OBSERVABILITY_ENABLED?: string;
  QA_CLOUDFLARE_LOGS_URL?: string;
  QA_GRAFANA_URL?: string;
}

export interface QaObservabilityConfig {
  enabled: boolean;
  environment: string;
  logViews: {
    cloudflare?: string;
    grafana?: string;
  };
}

function isSafeLogViewUrl(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    return !/[?&](?:token|key|secret|password|auth|credential)=/i.test(url.search);
  } catch {
    return false;
  }
}

export function qaObservabilityEnabled(env: QaObservabilityEnv): boolean {
  // Local and preview are QA surfaces by default. Production requires an
  // explicit opt-in so a static route cannot accidentally become an operator
  // tool on the public deployment.
  if (env.DEPLOYMENT_ENV === "production") return env.QA_OBSERVABILITY_ENABLED === "true";
  if (env.DEPLOYMENT_ENV !== "local" && env.DEPLOYMENT_ENV !== "preview") return env.QA_OBSERVABILITY_ENABLED === "true";
  return env.QA_OBSERVABILITY_ENABLED !== "false";
}

export function qaObservabilityConfig(env: QaObservabilityEnv): QaObservabilityConfig {
  const enabled = qaObservabilityEnabled(env);
  return {
    enabled,
    environment: env.DEPLOYMENT_ENV ?? "unknown",
    logViews: enabled
      ? {
          ...(isSafeLogViewUrl(env.QA_CLOUDFLARE_LOGS_URL) ? { cloudflare: env.QA_CLOUDFLARE_LOGS_URL } : {}),
          ...(isSafeLogViewUrl(env.QA_GRAFANA_URL) ? { grafana: env.QA_GRAFANA_URL } : {}),
        }
      : {},
  };
}
