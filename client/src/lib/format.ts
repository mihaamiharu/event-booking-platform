// Regional presentation (NFR-009, UI-DESIGN §7): API integers are the source
// of truth; rendering derives IDR grouping (.) and Asia/Jakarta WIB labels.

// `IDR 150.000` — code prefix, Indonesian thousands grouping, no decimals.
export function formatIdr(amountIdr: number): string {
  return `IDR ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amountIdr)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

// `Sat, 18 Sep 2026 · 09:00–12:00 WIB` from UTC API instants.
export function formatWibRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const parts = Object.fromEntries(
    dayFmt.formatToParts(start).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const jakartaMonth = Number(
    new Intl.DateTimeFormat("en-GB", { month: "numeric", timeZone: "Asia/Jakarta" }).format(start),
  );
  const day = `${parts.weekday}, ${parts.day} ${MONTHS[jakartaMonth - 1]} ${parts.year}`;
  return `${day} · ${timeFmt.format(start)}–${timeFmt.format(end)} WIB`;
}
