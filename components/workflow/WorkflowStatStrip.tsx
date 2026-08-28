type WorkflowStat = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
};

export function WorkflowStatStrip({ stats }: { stats: WorkflowStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="wf-stat-strip stats-grid" aria-label="Summary">
      {stats.map((s) => (
        <div key={s.label} className="stat-card wf-stat-card">
          <div className="stat-icon wf-stat-icon" aria-hidden="true">
            {s.icon ?? "WF"}
          </div>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">{s.value}</div>
          {s.hint ? <div className="stat-hint">{s.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}
