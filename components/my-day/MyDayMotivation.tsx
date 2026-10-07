"use client";

import { useMemo } from "react";
import { MOTIVATION, motivationMood, type MotivationLine } from "@/lib/my-day/motivation";

/** Same line all day, so the quote is already there and does not swap while someone is reading. */
function lineForDay(pool: MotivationLine[], salt: number): MotivationLine {
  if (pool.length === 0) return { text: "" };
  const now = new Date();
  const day = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000,
  );
  return pool[(day + salt) % pool.length];
}

function Quote({ line }: { line: MotivationLine }) {
  if (!line.text) return null;
  return (
    <blockquote className="myday-quote">
      <span className="myday-quote-text">{line.text}</span>
      {line.by ? <span className="myday-quote-by">{line.by}</span> : null}
    </blockquote>
  );
}

export function MyDayMotivation({
  open,
  total,
  count = 1,
}: {
  open: number;
  total: number;
  count?: 1 | 2;
}) {
  const mood = motivationMood(open, total);
  const pool = MOTIVATION[mood];
  const secondPool = useMemo(
    () => (mood === "last" ? [...MOTIVATION.last, ...MOTIVATION.going] : MOTIVATION[mood]),
    [mood],
  );
  const first = lineForDay(pool, 0);
  let second = lineForDay(secondPool, 1);
  if (second.text === first.text && secondPool.length > 1) {
    second = secondPool[(secondPool.indexOf(second) + 1) % secondPool.length];
  }

  return (
    <div className="myday-motivation">
      <Quote line={first} />
      {count === 2 ? <Quote line={second} /> : null}
    </div>
  );
}
