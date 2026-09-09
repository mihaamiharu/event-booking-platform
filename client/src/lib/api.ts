// API client (S3): JSON fetch with first-visit auto-provision.
// On 401 WORKSPACE_REQUIRED / 410 WORKSPACE_EXPIRED the client provisions
// (or re-provisions) once and retries the original request.
export interface ApiErrorShape {
  error: { code: string; message: string; correlationId?: string; fields?: Record<string, string> };
}

export class ApiError extends Error {
  status: number;
  code: string;
  correlationId?: string;
  fields?: Record<string, string>;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.error.message);
    this.status = status;
    this.code = shape.error.code;
    this.correlationId = shape.error.correlationId;
    this.fields = shape.error.fields;
  }
}

export function errorReference(error: unknown): string {
  if (!(error instanceof ApiError)) return "UNEXPECTED_ERROR";
  return formatErrorReference(error.code, error.correlationId);
}

export function formatErrorReference(code: string, correlationId?: string): string {
  return correlationId ? `${code} (reference ${correlationId})` : code;
}

async function provision(token?: string): Promise<void> {
  const res = await fetch("/api/workspaces/provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(token ? { turnstileToken: token } : {}),
  });
  if (!res.ok) {
    throw new ApiError(res.status, (await res.json()) as ApiErrorShape);
  }
}

async function provisionWithChallenge(): Promise<void> {
  try {
    await provision();
  } catch (e) {
    // Armed IPs solve a challenge, then the provision carries the token.
    if (!(e instanceof ApiError) || e.code !== "TURNSTILE_REQUIRED") throw e;
    const { requestChallengeToken } = await import("./turnstile.ts");
    const token = await requestChallengeToken();
    if (!token) throw e;
    await provision(token);
  }
}

export async function api<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  // S4: only workspace-context failures trigger auto-provision. Auth failures
  // (AUTH_INVALID_CREDENTIALS, AUTH_RATE_LIMITED) must surface, not loop.
  if ((res.status === 401 || res.status === 410) && !retried && path !== "/api/workspaces/provision") {
    const shape = (await res.clone().json().catch(() => null)) as ApiErrorShape | null;
    const code = shape?.error?.code;
    if (code === "WORKSPACE_REQUIRED" || code === "WORKSPACE_EXPIRED") {
      await provisionWithChallenge();
      return api<T>(path, init, true);
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, (await res.json()) as ApiErrorShape);
  }
  return (await res.json()) as T;
}

export interface Attendee {
  email: string;
  displayName: string;
}

export interface SessionResponse {
  attendee: Attendee;
}

const ATTENDEE_KEY = "ebp.attendee";

// Safe post-sign-in destination (UI-DESIGN §3.3): same-origin path only,
// never protocol-relative, never back into /sign-in.
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/events";
  if (raw === "/sign-in" || raw === "/sign-in/") return "/events";
  return raw;
}

export function getAttendee(): Attendee | null {
  try {
    const raw = window.localStorage.getItem(ATTENDEE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attendee;
    if (typeof parsed.email !== "string" || typeof parsed.displayName !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAttendee(a: Attendee): void {
  window.localStorage.setItem(ATTENDEE_KEY, JSON.stringify(a));
}

export function clearAttendee(): void {
  window.localStorage.removeItem(ATTENDEE_KEY);
}

// POST /api/session (ACC-001). Throws ApiError: AUTH_INVALID_CREDENTIALS
// (401), AUTH_RATE_LIMITED (429), VALIDATION_FAILED (400).
export async function signIn(email: string, password: string): Promise<Attendee> {
  const res = await api<SessionResponse>("/api/session", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAttendee(res.attendee);
  return res.attendee;
}

// DELETE /api/session: always 204 (no oracle); clears local state too.
// Raw fetch: 204 carries no JSON body for api<T>() to parse.
export async function signOut(): Promise<void> {
  await fetch("/api/session", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  }).catch(() => undefined);
  clearAttendee();
}
