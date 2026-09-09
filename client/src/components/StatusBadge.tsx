export type StatusTone =
  | "available"
  | "sold-out"
  | "bookable"
  | "unavailable"
  | "confirmed"
  | "paid"
  | "neutral";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
}) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
