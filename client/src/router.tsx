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

export function Link({
  to,
  children,
  className,
  ariaCurrent,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
  ariaCurrent?: "page";
}) {
  return (
    <a
      href={to}
      className={className}
      aria-current={ariaCurrent}
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

export function isSignIn(path: string): boolean {
  return path === "/sign-in" || path === "/sign-in/";
}

export function isCheckout(path: string): boolean {
  return path === "/checkout" || path === "/checkout/";
}

export function isBookings(path: string): boolean {
  return path === "/bookings" || path === "/bookings/";
}

export function isDemo(path: string): boolean {
  return path === "/demo" || path === "/demo/";
}

export function isQaObservability(path: string): boolean {
  return path === "/qa/observability" || path === "/qa/observability/";
}

export function isOrganizer(path: string): boolean {
  return path === "/organizer" || path === "/organizer/";
}

export function matchBookingRef(path: string): string | null {
  const m = /^\/bookings\/([^/]+)\/?$/.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}
