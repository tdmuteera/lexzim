"use client";

import { useEffect, useRef, useState } from "react";

export function ProgressRing({
  done,
  total,
  size = 112,
  stroke = 10,
}: {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, done / total) : 0;
  return (
    <div className="myday-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id="myday-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F3D48A" />
            <stop offset="100%" stopColor="#C4903E" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} className="myday-ring-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="myday-ring-fill"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="myday-ring-label">
        <strong>
          {done}
          <span>/{total}</span>
        </strong>
        <em>{total && done >= total ? "all done" : "done"}</em>
      </div>
    </div>
  );
}

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.5c.6 3-1.6 4.6-2.9 6.4C7.8 10.7 7 12.3 7 14.3 7 17.9 9.3 21 12 21s5-3 5-6.6c0-2.2-1-4-2.2-5.2.1 1.7-.6 3-1.8 3.6.4-3.8-.3-7.4-1-10.3z"
        fill="currentColor"
      />
    </svg>
  );
}

export function RepeatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 11V9a3 3 0 013-3h11m0 0l-3-3m3 3l-3 3M20 13v2a3 3 0 01-3 3H6m0 0l3 3m-3-3l3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 12.5l4.2 4.2L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Pure-CSS celebration burst shown when every item for today is done. */
export function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className="myday-confetti" aria-hidden>
      {pieces.map((i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 7) * 0.12}s`,
            background: ["#F3D48A", "#C4903E", "#FFFFFF", "#7FB69A", "#E7A3C4"][i % 5],
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function useOutsideClose<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

export function useJustCompleted() {
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 650);
    return () => window.clearTimeout(t);
  }, [flash]);
  return [flash, setFlash] as const;
}
