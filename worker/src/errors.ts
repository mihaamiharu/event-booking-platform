// Stable error shape (NFR-004, API-CONTRACT §1.2).
// `code` is stable; `message` is R1 copy and may change. correlationId rides
// on 401/404/409/422/429/5xx for operator lookup — never stacks, SQL, or
// cross-workspace clues.
export interface ErrorFields {
  [field: string]: string;
}

export function err(
  status: number,
  code: string,
  opts: { message?: string; fields?: ErrorFields; correlation?: boolean } = {},
): Response {
  const body: {
    error: { code: string; message: string; correlationId?: string; fields?: ErrorFields };
  } = {
    error: { code, message: opts.message ?? code },
  };
  if (opts.fields) body.error.fields = opts.fields;
  if (opts.correlation !== false && status !== 400) {
    body.error.correlationId = crypto.randomUUID();
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
