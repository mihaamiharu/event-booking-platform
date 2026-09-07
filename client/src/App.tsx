import { useEffect, useState } from "react";
import { isBookings, isCheckout, isSignIn, Link, matchBookingRef, matchEventSlug, usePath } from "./router.tsx";
import { BookingDetail } from "./routes/BookingDetail.tsx";
import { Bookings } from "./routes/Bookings.tsx";
import { Checkout } from "./routes/Checkout.tsx";
import { EventDetail } from "./routes/EventDetail.tsx";
import { Events } from "./routes/Events.tsx";
import { SignIn } from "./routes/SignIn.tsx";
import { clearAttendee, getAttendee, signOut, type Attendee } from "./lib/api.ts";
import { PRODUCT_NAME } from "./main.tsx";

// S3 chrome (UI-DESIGN §2): skip link, nav landmark, one h1 per route.
// S4 (ACC-001): attendee menu + sign out in the header when signed in.
export function App() {
  const path = usePath();
  const slug = matchEventSlug(path);
  const bookingRef = matchBookingRef(path);
  const signInRoute = isSignIn(path);
  const checkoutRoute = isCheckout(path);
  const bookingsRoute = isBookings(path);
  const isEvents = path === "/events" || path === "/" || slug !== null;
  const [attendee, setAttendee] = useState<Attendee | null>(null);

  useEffect(() => {
    setAttendee(getAttendee());
  }, [path]);

  const onSignOut = async () => {
    await signOut();
    setAttendee(null);
  };

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
          <Link to="/bookings">My bookings</Link>
          {attendee ? (
            <>
              <span aria-label="Signed-in attendee">
                {attendee.displayName}
              </span>
              <button type="button" onClick={() => void onSignOut()}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/sign-in">Sign in</Link>
          )}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {signInRoute ? (
          <SignIn />
        ) : checkoutRoute ? (
          <Checkout />
        ) : bookingsRoute ? (
          <Bookings />
        ) : bookingRef !== null ? (
          <BookingDetail reference={bookingRef} />
        ) : slug !== null ? (
          <EventDetail slug={slug} />
        ) : isEvents ? (
          <Events />
        ) : (
          <NotFound />
        )}
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
