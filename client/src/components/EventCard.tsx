import { Link } from "../router.tsx";
import { formatIdr, formatWibDateRange } from "../lib/format.ts";
import { StatusBadge } from "./StatusBadge.tsx";

export interface CatalogEvent {
  slug: string;
  name: string;
  venue: { name: string; city: string };
  dateRange: { startAt: string; endAt: string };
  startingPriceIdr: number;
  currency: string;
  availabilityStatus: "AVAILABLE" | "SOLD_OUT";
}

export function EventCard({ event }: { event: CatalogEvent }) {
  const soldOut = event.availabilityStatus === "SOLD_OUT";
  return (
    <article className={`card event-card ${soldOut ? "event-card-sold-out" : ""}`} aria-labelledby={`event-${event.slug}`}>
      <div className="card-topline">
        <span className="eyebrow">Featured event</span>
        <StatusBadge tone={soldOut ? "sold-out" : "available"}>
          {soldOut ? "Sold out" : "Available"}
        </StatusBadge>
      </div>
      <h2 id={`event-${event.slug}`}>{event.name}</h2>
      <div className="event-card-meta">
        <p>
          <span className="meta-label">When</span>
          <span>{formatWibDateRange(event.dateRange.startAt, event.dateRange.endAt)}</span>
        </p>
        <p>
          <span className="meta-label">Where</span>
          <span>
            {event.venue.name} · {event.venue.city}
          </span>
        </p>
      </div>
      <div className="event-card-footer">
        <p className="price-block">
          <span className="meta-label">From</span>
          <strong>{formatIdr(event.startingPriceIdr)}</strong>
        </p>
        <Link className="button button-secondary" to={`/events/${event.slug}`}>
          View details
        </Link>
      </div>
    </article>
  );
}
