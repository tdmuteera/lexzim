/**
 * Detect missing Postgres relations from raw or Drizzle-wrapped errors.
 */
export function isMissingRelationError(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 6 && current; i++) {
    const msg =
      current instanceof Error
        ? `${current.message} ${current.name}`
        : typeof current === "string"
          ? current
          : "";
    const code =
      current && typeof current === "object" && "code" in current
        ? String((current as { code?: unknown }).code ?? "")
        : "";
    if (
      code === "42P01" ||
      /relation .* does not exist/i.test(msg) ||
      /undefined_table/i.test(msg)
    ) {
      return true;
    }
    current =
      current instanceof Error && "cause" in current
        ? (current as Error & { cause?: unknown }).cause
        : null;
  }
  return false;
}
