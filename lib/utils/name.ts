export function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return fullName.slice(0, 2).toUpperCase() || "—";
}

/** First given name for greetings (e.g. "Cathrine Dhliwayoe" → "Cathrine"). */
export function firstNameFromFullName(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/).filter(Boolean)[0];
  return first || "there";
}
