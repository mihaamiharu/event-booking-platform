// Signed workspace context (WSP-001, AUTH-SECURITY §2).
// Cookie: base64url(workspaceId).base64url(random24B).base64url(HMAC-SHA256).
// HttpOnly; SameSite=Lax; Path=/; Max-Age=7d; Secure except on localhost.

const enc = new TextEncoder();

export interface WorkspaceRow {
  id: string;
  seed_version: string;
  seed_reference_at: string;
  last_active_at: string;
  status: string;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacHex(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function signWorkspace(workspaceId: string, secret: string): Promise<string> {
  const rand = b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
  const wid = b64urlEncode(enc.encode(workspaceId));
  const sig = b64urlEncode(await hmacHex(secret, `${wid}.${rand}`));
  return `${wid}.${rand}.${sig}`;
}

export async function verifyWorkspace(
  cookie: string,
  secret: string,
): Promise<string | null> {
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [wid, rand, sig] = parts as [string, string, string];
  let sigBytes: Uint8Array;
  let widBytes: Uint8Array;
  try {
    sigBytes = b64urlDecode(sig);
    widBytes = b64urlDecode(wid);
  } catch {
    return null;
  }
  const expected = await hmacHex(secret, `${wid}.${rand}`);
  if (!timingSafeEqual(sigBytes, expected)) return null;
  try {
    return new TextDecoder().decode(widBytes);
  } catch {
    return null;
  }
}

export function workspaceCookieHeader(value: string, secure: boolean): string {
  const parts = [
    `ebp_workspace=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=604800",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestIsSecure(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export const WORKSPACE_TTL_MS = 7 * 86_400_000;

export function isExpired(lastActiveAt: string, nowMs: number): boolean {
  return nowMs - Date.parse(lastActiveAt) > WORKSPACE_TTL_MS;
}
