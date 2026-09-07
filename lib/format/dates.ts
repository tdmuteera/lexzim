/** Zimbabwe-friendly date/time formatting (en-GB, Africa/Harare). */

const TZ = "Africa/Harare";
const LOCALE = "en-GB";

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(LOCALE, {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Formal date for letters and pleadings, e.g. 7 September 2026. */
export function formatLongDate(iso: string | Date | null | undefined = new Date()): string {
  const d = !iso ? new Date() : typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(LOCALE, {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE, {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
