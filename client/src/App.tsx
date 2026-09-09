import { useEffect, useState } from "react";
import {
  isBookings,
  isCheckout,
  isDemo,
  isQaObservability,
  isSignIn,
  Link,
  matchBookingRef,
  matchEventSlug,
  usePath,
} from "./router.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { BookingDetail } from "./routes/BookingDetail.tsx";
import { Bookings } from "./routes/Bookings.tsx";
import { Checkout } from "./routes/Checkout.tsx";
import { Demo } from "./routes/Demo.tsx";
import { EventDetail } from "./routes/EventDetail.tsx";
import { Events } from "./routes/Events.tsx";
import { SignIn } from "./routes/SignIn.tsx";
import { QAObservability } from "./routes/QAObservability.tsx";
import { getAttendee, signOut, type Attendee } from "./lib/api.ts";
import { PRODUCT_NAME } from "./lib/constants.ts";

// S3 chrome (UI-DESIGN §2): skip link, nav landmark, one h1 per route.
// S4 (ACC-001): attendee menu + sign out in the header when signed in.
export function App() {
  const path = usePath();
  const slug = matchEventSlug(path);
  const bookingRef = matchBookingRef(path);
  const signInRoute = isSignIn(path);
  const checkoutRoute = isCheckout(path);
  const bookingsRoute = isBookings(path);
  const demoRoute = isDemo(path);
  const qaObservabilityRoute = isQaObservability(path);
  const isEvents = path === "/events" || path === "/" || slug !== null;
  const [attendee, setAttendee] = useState<Attendee | null>(null);

  useEffect(() => {
    setAttendee(getAttendee());
  }, [path]);

  useEffect(() => {
    const routeTitle = signInRoute
      ? "Sign in"
      : checkoutRoute
        ? "Checkout"
        : bookingsRoute
          ? "My bookings"
          : demoRoute
            ? "Demo controls"
            : qaObservabilityRoute
              ? "QA observability cockpit"
              : bookingRef !== null
                ? "Booking details"
                : slug !== null
                  ? "Event details"
                  : isEvents
                    ? "Events"
                    : "Page not found";
    document.title = `${routeTitle} — ${PRODUCT_NAME}`;
  }, [bookingRef, bookingsRoute, checkoutRoute, demoRoute, isEvents, qaObservabilityRoute, signInRoute, slug, path]);

  const onSignOut = async () => {
    await signOut();
    setAttendee(null);
  };

  return (
    <AppShell path={path} productName={PRODUCT_NAME} attendee={attendee} onSignOut={onSignOut}>
      {signInRoute ? (
        <SignIn />
      ) : checkoutRoute ? (
        <Checkout />
      ) : bookingsRoute ? (
        <Bookings />
      ) : qaObservabilityRoute ? (
        <QAObservability />
      ) : demoRoute ? (
        <Demo />
      ) : bookingRef !== null ? (
        <BookingDetail reference={bookingRef} />
      ) : slug !== null ? (
        <EventDetail slug={slug} />
      ) : isEvents ? (
        <Events />
      ) : (
        <NotFound />
      )}
    </AppShell>
  );
}

function NotFound() {
  return (
    <>
      <div className="page-heading compact-heading">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="lede">The page you are looking for does not exist.</p>
      </div>
      <div className="state-card empty">
        <p>Try browsing the current events or return to the attendee home.</p>
        <Link className="button button-primary" to="/events">
          Browse events
        </Link>
      </div>
    </>
  );
}
