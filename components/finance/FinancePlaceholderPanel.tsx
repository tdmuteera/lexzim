import { AccessDenied } from "@/components/shell/AccessDenied";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";

/**
 * Phase 11 P11-04: empty Finance shells until later prompts add posting UI.
 */
export async function FinancePlaceholderPanel(props: {
  path: string;
  title: string;
  purpose: string;
  comingIn: string;
}) {
  const access = await getRouteAccessStatus(props.path);
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }

  return (
    <section className="view active scrollable" aria-label={props.title}>
      <div className="panel">
        <div className="panel-head">
          <h3>{props.title}</h3>
        </div>
        <div className="panel-body">
          <p style={{ marginTop: 0 }}>{props.purpose}</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Placeholder shell for Phase 11. Full workflow lands in {props.comingIn}. Existing Trust,
            Invoicing, and Expenses stay unchanged.
          </p>
        </div>
      </div>
    </section>
  );
}
