"use client";

import { useEffect, useState } from "react";

const DEFAULT_MS = 850;
const ZERO_FROM = 100;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Count from 0 to target. If target is 0, count down from 100 to 0
 * so empty KPIs still move. Instant when the user prefers reduced motion.
 */
export function useAnimatedNumber(target: number, durationMs = DEFAULT_MS): number {
  const safe = Number.isFinite(target) ? Math.round(target) : 0;
  const [value, setValue] = useState(() => (safe === 0 ? ZERO_FROM : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(safe);
      return;
    }
    const from = safe === 0 ? ZERO_FROM : 0;
    const to = safe;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safe, durationMs]);

  return value;
}

export function AnimatedNumber({
  value,
  durationMs = DEFAULT_MS,
  format = String,
  className,
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const shown = useAnimatedNumber(value, durationMs);
  const finalLabel = format(Number.isFinite(value) ? Math.round(value) : 0);
  return (
    <span className={className} aria-label={finalLabel}>
      {format(shown)}
    </span>
  );
}
