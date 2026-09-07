// Minimal pathname router (S3): two routes, no dependency. History-based
// navigation with popstate; same-origin paths only.
import { useSyncExternalStore } from "react";

function currentPath(): string {
  return window.location.pathname;
}

let listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener("popstate", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("popstate", notify);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath, currentPath);
}

export function navigate(to: string): void {
  if (!to.startsWith("/")) return;
  window.history.pushState(null, "", to);
  for (const notify of listeners) notify();
}

export function Link({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function matchEventSlug(path: string): string | null {
  const m = /^\/events\/([^/]+)\/?$/.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}
