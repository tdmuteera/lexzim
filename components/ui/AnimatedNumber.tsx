"use client";

/**
 * Instant KPI values. Count-up motion is disabled for a calm UI.
 */
export function useAnimatedNumber(target: number, _durationMs?: number): number {
  return Number.isFinite(target) ? Math.round(target) : 0;
}

export function AnimatedNumber({
  value,
  format = String,
  className,
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const shown = useAnimatedNumber(value);
  const finalLabel = format(shown);
  return (
    <span className={className} aria-label={finalLabel}>
      {format(shown)}
    </span>
  );
}
