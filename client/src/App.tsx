import { Link, matchEventSlug, usePath } from "./router.tsx";
import { EventDetail } from "./routes/EventDetail.tsx";
import { Events } from "./routes/Events.tsx";
import { PRODUCT_NAME } from "./main.tsx";

// S3 chrome (UI-DESIGN §2): skip link, nav landmark, one h1 per route.
export function App() {
  const path = usePath();
  const slug = matchEventSlug(path);
  const isEvents = path === "/events" || path === "/" || slug !== null;

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // Safari does not move focus on skip-link activation; do it
          // explicitly so keyboard users land in content everywhere.
          e.preventDefault();
          window.location.hash = "main";
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <nav aria-label="Primary">
          <Link to="/events">{PRODUCT_NAME}</Link>
          <Link to="/events">Events</Link>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {slug !== null ? <EventDetail slug={slug} /> : isEvents ? <Events /> : <NotFound />}
      </main>
    </>
  );
}

function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <div className="empty">
        <p>This page does not exist.</p>
      </div>
    </>
  );
}
