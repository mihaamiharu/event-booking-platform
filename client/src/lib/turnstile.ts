// Turnstile challenge helper (S8; AUTH-SECURITY §5, usage-model §6).
// Explicit-render widget with no new dependencies. The site key is public
// config: `window.EBP_TURNSTILE_SITEKEY` override, else the dummy fallback
// (local only — the server only honors the demo pass under a dummy secret).
// Resolves null when the user cancels or the widget errors.

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      remove(id: string): void;
    };
    EBP_TURNSTILE_SITEKEY?: string;
  }
}

export const DUMMY_SITE_KEY = "DUMMY-SITEKEY-LOCAL";
export const DUMMY_TOKEN_LOCAL = "DUMMY-PASS-LOCAL";

export function siteKey(): string {
  return window.EBP_TURNSTILE_SITEKEY ?? DUMMY_SITE_KEY;
}

function loadScript(): Promise<void> {
  if (document.querySelector('script[data-ebp-turnstile]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.dataset.ebpTurnstile = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("challenge script failed"));
    document.head.appendChild(s);
  });
}

export function requestChallengeToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "challenge-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Verification challenge");
    const box = document.createElement("div");
    box.className = "challenge-box";
    const done = (token: string | null) => {
      overlay.remove();
      resolve(token);
    };
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.onclick = () => done(null);
    box.append(cancel);
    overlay.append(box);
    document.body.append(overlay);
    cancel.focus();

    if (siteKey() === DUMMY_SITE_KEY) {
      const note = document.createElement("p");
      note.textContent = "Local demo challenge — no real verification.";
      const pass = document.createElement("button");
      pass.type = "button";
      pass.textContent = "Use demo pass (local only)";
      pass.onclick = () => done(DUMMY_TOKEN_LOCAL);
      box.prepend(note, pass);
      return;
    }
    loadScript().then(
      () => {
        try {
          const host = document.createElement("div");
          box.prepend(host);
          window.turnstile!.render(host, {
            sitekey: siteKey(),
            callback: (token: string) => done(token),
            "error-callback": () => done(null),
          });
        } catch {
          done(null);
        }
      },
      () => done(null),
    );
  });
}
