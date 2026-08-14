export default function PlatformLoading() {
  return (
    <div className="view active" aria-busy="true" aria-label="Loading module">
      <div className="dash-skeleton" style={{ padding: "0.25rem 0" }}>
        <div className="dash-skeleton-block" style={{ width: "28%", height: 26 }} />
        <div className="dash-skeleton-block" style={{ width: "55%", height: 14, marginTop: 10 }} />
        <div className="dash-skeleton-row" style={{ marginTop: 18 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="dash-skeleton-block" style={{ height: 88 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
