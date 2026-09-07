// API client (S3): JSON fetch with first-visit auto-provision.
// On 401 WORKSPACE_REQUIRED / 410 WORKSPACE_EXPIRED the client provisions
// (or re-provisions) once and retries the original request.
export interface ApiErrorShape {
  error: { code: string; message: string; correlationId?: string; fields?: Record<string, string> };
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.error.message);
    this.status = status;
    this.code = shape.error.code;
    this.fields = shape.error.fields;
  }
}

async function provision(): Promise<void> {
  const res = await fetch("/api/workspaces/provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    throw new ApiError(res.status, (await res.json()) as ApiErrorShape);
  }
}

export async function api<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if ((res.status === 401 || res.status === 410) && !retried && path !== "/api/workspaces/provision") {
    await provision();
    return api<T>(path, init, true);
  }
  if (!res.ok) {
    throw new ApiError(res.status, (await res.json()) as ApiErrorShape);
  }
  return (await res.json()) as T;
}
