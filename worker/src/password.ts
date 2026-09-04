// Password hashing (ACC-001, AUTH-SECURITY §3, SPIKE-A lock).
// WebCrypto only — runs in the Worker isolate and in Node ≥22.
import { PASSWORD_PBKDF2_ITERATIONS } from "./config.ts";

const enc = new TextEncoder();

export function randomSaltB64(bytes = 16): string {
  const salt = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of salt) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return buf;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(
  password: string,
  saltB64: string,
  iterations: number = PASSWORD_PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: b64ToBytes(saltB64),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(
  password: string,
  saltB64: string,
  expectedHex: string,
  iterations: number = PASSWORD_PBKDF2_ITERATIONS,
): Promise<boolean> {
  const actual = await hashPassword(password, saltB64, iterations);
  if (actual.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}
