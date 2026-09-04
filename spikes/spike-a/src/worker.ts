// SPIKE-A worker (ACC-001, NFR-001) — Closes #21.
// Throwaway benchmark route. Measures PBKDF2-SHA256 server-side CPU with
// performance.now() so results reflect isolate CPU, not network RTT.

const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface BenchBody {
  password?: unknown;
  saltB64?: unknown;
  iterations?: unknown;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/__spike/health") {
      return json({ status: "ok", spike: "spike-a" });
    }

    if (request.method === "POST" && url.pathname === "/__spike/pbkdf2") {
      let body: BenchBody;
      try {
        body = (await request.json()) as BenchBody;
      } catch {
        return json({ error: { code: "VALIDATION_FAILED" } }, 400);
      }

      const { password, saltB64, iterations } = body;
      if (
        typeof password !== "string" ||
        password.length === 0 ||
        password.length > 256 ||
        typeof iterations !== "number" ||
        !Number.isInteger(iterations) ||
        iterations < 1 ||
        iterations > 500_000
      ) {
        return json({ error: { code: "VALIDATION_FAILED" } }, 400);
      }

      let salt: Uint8Array;
      if (saltB64 === undefined) {
        salt = crypto.getRandomValues(new Uint8Array(16));
      } else {
        if (typeof saltB64 !== "string" || saltB64.length > 64) {
          return json({ error: { code: "VALIDATION_FAILED" } }, 400);
        }
        try {
          salt = b64ToBytes(saltB64);
        } catch {
          return json({ error: { code: "VALIDATION_FAILED" } }, 400);
        }
        if (salt.length !== 16) {
          return json({ error: { code: "VALIDATION_FAILED" } }, 400);
        }
      }

      const t0 = performance.now();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
        key,
        256,
      );
      const t1 = performance.now();

      return json({
        iterations,
        ms: t1 - t0,
        saltB64: bytesToB64(salt),
        digestPrefix: bytesToHex(new Uint8Array(bits)).slice(0, 16),
      });
    }

    return json({ error: { code: "NOT_FOUND" } }, 404);
  },
};
