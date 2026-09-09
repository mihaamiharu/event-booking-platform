import type { ReactNode } from "react";
import { Link } from "../router.tsx";
import type { Attendee } from "../lib/api.ts";

interface AppShellProps {
  children: ReactNode;
  path: string;
  productName: string;
  attendee: Attendee | null;
  onSignOut: () => void;
}

function isCurrent(path: string, target: "events" | "bookings" | "sign-in"): boolean {
  if (target === "events") return path === "/" || path.startsWith("/events");
  if (target === "bookings") return path.startsWith("/bookings");
  return path.startsWith("/sign-in");
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppShell({ children, path, productName, attendee, onSignOut }: AppShellProps) {
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          window.location.hash = "main";
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/events" className="brand" aria-label={`${productName} home`}>
            <span className="brand-mark" aria-hidden="true">
              EBP
            </span>
            <span className="brand-copy">
              <strong>{productName}</strong>
              <span>Attendee booking</span>
            </span>
          </Link>
          <nav className="primary-nav" aria-label="Primary">
            <Link
              to="/events"
              className={`nav-link ${isCurrent(path, "events") ? "is-current" : ""}`}
              aria-current={isCurrent(path, "events") ? "page" : undefined}
            >
              Events
            </Link>
            <Link
              to="/bookings"
              className={`nav-link ${isCurrent(path, "bookings") ? "is-current" : ""}`}
              aria-current={isCurrent(path, "bookings") ? "page" : undefined}
            >
              My bookings
            </Link>
            {attendee ? (
              <div className="account-menu">
                <span className="user-chip" aria-label="Signed-in attendee">
                  <span className="avatar" aria-hidden="true">
                    {initials(attendee.displayName)}
                  </span>
                  <span>{attendee.displayName}</span>
                </span>
                <button className="button-link" type="button" onClick={() => void onSignOut()}>
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/sign-in"
                className={`nav-link nav-link-cta ${isCurrent(path, "sign-in") ? "is-current" : ""}`}
                aria-current={isCurrent(path, "sign-in") ? "page" : undefined}
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="site-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <strong>{productName}</strong>
            <span> A focused, deterministic way to book your next event.</span>
          </div>
          <Link to="/demo" className="footer-link">
            Demo controls
          </Link>
        </div>
      </footer>
    </div>
  );
}
