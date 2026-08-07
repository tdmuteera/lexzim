import { Badge } from "@/components/ui/Badge";
import type { RouteMeta } from "@/lib/nav";

export function PlaceholderPage({ meta }: { meta: RouteMeta }) {
  return (
    <section className="view active scrollable" aria-label={meta.title}>
      <div className="panel">
        <div className="panel-head">
          <h3>{meta.title}</h3>
          <Badge tone="pending">{meta.phaseBadge}</Badge>
        </div>
        <div className="panel-body">
          <p style={{ color: "var(--text-2)", marginBottom: "0.75rem", maxWidth: "40rem" }}>
            {meta.purpose}
          </p>
          <p className="muted">
            This is a Phase 0 placeholder route. Real module behaviour is built in later
            phases. Navigation and shell chrome match the T Pfigu Attorneys demo.
          </p>
        </div>
      </div>
    </section>
  );
}
