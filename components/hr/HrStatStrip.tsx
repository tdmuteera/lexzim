type HrStat = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
};

export function HrStatStrip({ stats }: { stats: HrStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="hr-stat-strip stats-grid" aria-label="Summary">
      {stats.map((s) => (
        <div key={s.label} className="stat-card hr-stat-card">
          <div className="stat-icon hr-stat-icon" aria-hidden="true">
            {s.icon ?? "HR"}
          </div>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">{s.value}</div>
          {s.hint ? <div className="stat-hint">{s.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}
