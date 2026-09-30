"use client";

import { useEffect, useMemo, useState } from "react";
import { MOTIVATION, motivationMood, type MotivationLine } from "@/lib/my-day/motivation";

const FLIGHTS = ["swoop", "drop", "spin", "wobble", "plane", "rocket", "squash"] as const;
const ROTATE_MS = 14000;

function pick<T>(list: T[], avoid?: T): T {
  if (list.length < 2) return list[0];
  let next = list[Math.floor(Math.random() * list.length)];
  while (next === avoid) next = list[Math.floor(Math.random() * list.length)];
  return next;
}

function useRotatingLine(pool: MotivationLine[], offsetMs: number) {
  const [state, setState] = useState<{ line: MotivationLine; flight: string; n: number } | null>(null);

  useEffect(() => {
    const show = () =>
      setState((prev) => ({
        line: pick(pool, prev?.line),
        flight: pick([...FLIGHTS], prev?.flight as (typeof FLIGHTS)[number] | undefined),
        n: (prev?.n ?? 0) + 1,
      }));
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      show();
      interval = setInterval(show, ROTATE_MS);
    }, offsetMs);
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, [pool, offsetMs]);

  const next = () =>
    setState((prev) => ({
      line: pick(pool, prev?.line),
      flight: pick([...FLIGHTS], prev?.flight as (typeof FLIGHTS)[number] | undefined),
      n: (prev?.n ?? 0) + 1,
    }));

  return { state, next };
}

function Quote({ pool, offsetMs }: { pool: MotivationLine[]; offsetMs: number }) {
  const { state, next } = useRotatingLine(pool, offsetMs);
  if (!state) return <div className="myday-quote is-placeholder" aria-hidden />;
  return (
    <button
      type="button"
      key={state.n}
      className={`myday-quote fly-${state.flight}`}
      onClick={next}
      title="Another one"
    >
      <span className="myday-quote-text">{state.line.text}</span>
      {state.line.by ? <span className="myday-quote-by">{state.line.by}</span> : null}
    </button>
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

  return (
    <div className="myday-motivation" aria-live="polite">
      <Quote pool={pool} offsetMs={250} />
      {count === 2 ? <Quote pool={secondPool} offsetMs={1400} /> : null}
    </div>
  );
}
