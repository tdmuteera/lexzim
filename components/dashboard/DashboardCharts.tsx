"use client";

import { useEffect, useMemo, useState } from "react";

export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export function AnimatedDonutChart({
  slices,
  totalLabel = "total",
}: {
  slices: DonutSlice[];
  totalLabel?: string;
}) {
  const [progress, setProgress] = useState(0);
  const total = slices.reduce((s, x) => s + x.value, 0);

  useEffect(() => {
    setProgress(0);
    let raf = 0;
    const start = performance.now();
    const duration = 1100;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slices]);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let angle = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * 360 * progress;
        const start = angle;
        const end = angle + Math.max(sweep, 0.01);
        angle += (s.value / total) * 360 * progress;
        return { ...s, start, end, path: arcPath(100, 100, 70, start, end) };
      });
  }, [slices, total, progress]);

  return (
    <div className="dash-donut">
      <svg viewBox="0 0 200 200" className="dash-donut-svg" aria-hidden>
        <circle
          cx="100"
          cy="100"
          r="70"
          fill="none"
          stroke="rgba(40,36,30,0.08)"
          strokeWidth="22"
        />
        {arcs.map((a) => (
          <path
            key={a.key}
            d={a.path}
            fill="none"
            stroke={a.color}
            strokeWidth="22"
            strokeLinecap="butt"
          />
        ))}
        <text
          x="100"
          y="96"
          textAnchor="middle"
          className="dash-donut-total"
        >
          {Math.round(total * progress)}
        </text>
        <text
          x="100"
          y="116"
          textAnchor="middle"
          className="dash-donut-sub"
        >
          {totalLabel}
        </text>
      </svg>
      <ul className="dash-donut-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} />
            <span>
              {s.label} <strong>{s.value}</strong>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnimatedBarChart({
  bars,
  formatValue,
}: {
  bars: Array<{ key: string; label: string; value: number; title?: string }>;
  formatValue?: (n: number) => string;
}) {
  const [progress, setProgress] = useState(0);
  const max = Math.max(1, ...bars.map((b) => b.value));

  useEffect(() => {
    setProgress(0);
    let raf = 0;
    const start = performance.now();
    const duration = 1000;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bars]);

  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  return (
    <div className="dash-bars" role="img" aria-label="Fee revenue chart">
      <div className="dash-bars-y">
        {ticks
          .slice()
          .reverse()
          .map((t) => (
            <span key={t}>{formatValue ? formatValue(t) : t}</span>
          ))}
      </div>
      <div className="dash-bars-plot">
        <div className="dash-bars-grid">
          {ticks.map((t) => (
            <div key={t} className="dash-bars-gridline" />
          ))}
        </div>
        <div className="dash-bars-cols">
          {bars.map((b, i) => {
            const h = (b.value / max) * 100 * progress;
            const shown = formatValue ? formatValue(b.value) : String(Math.round(b.value));
            return (
              <div
                key={b.key}
                className="dash-bar-col"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="dash-bar-stack">
                  <span className="dash-bar-value">{shown}</span>
                  <div className="dash-bar-track">
                    <div
                      className="dash-bar-fill"
                      style={{ height: `${h}%` }}
                      title={shown}
                    />
                  </div>
                </div>
                <span className="dash-bar-label" title={b.title ?? b.label}>
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}
