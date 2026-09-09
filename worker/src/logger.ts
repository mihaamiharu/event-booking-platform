// Request-scoped structured logging (NFR-004/NFR-006).
//
// The logger deliberately has a tiny sink interface so local tests can capture
// records without scraping console output. Production uses JSON console lines,
// which Cloudflare Workers Logs can collect and third-party exporters can
// forward without changing application handlers.

export interface RequestLogRecord {
  event: "api.request" | "worker.cleanup" | "worker.exception";
  timestamp: string;
  correlationId: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  workspace?: string;
  errorCode?: string;
  rowsRead?: number;
  rowsWritten?: number;
  expired?: number;
  message?: string;
}

export type LogSink = (record: RequestLogRecord) => void;

let sink: LogSink = (record) => {
  console.log(JSON.stringify(record));
};

export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

export function emitLog(record: RequestLogRecord): void {
  try {
    sink(record);
  } catch {
    // Logging must never change a product outcome.
  }
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export async function workspacePseudonym(workspaceId: string | undefined): Promise<string | undefined> {
  if (!workspaceId) return undefined;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(workspaceId));
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Add the request correlation header and, for JSON API errors, make the body
 * use the same ID that is searchable in the request log.
 */
export async function withCorrelationId(response: Response, correlationId: string): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("x-correlation-id", correlationId);

  // Buffer a clone once. Reusing the original body stream after inspecting a
  // clone is not supported consistently by the local Miniflare runtime.
  const bytes = await response.clone().arrayBuffer();

  if (response.headers.get("content-type")?.includes("application/json") && response.status >= 400) {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { error?: { correlationId?: string } };
    if (body?.error) {
      body.error.correlationId = correlationId;
      return new Response(JSON.stringify(body), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  }

  return new Response(bytes, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
