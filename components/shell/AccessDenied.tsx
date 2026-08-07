import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

type AccessDeniedProps = {
  permission?: string;
  title?: string;
};

export function AccessDenied({
  permission,
  title = "Access denied",
}: AccessDeniedProps) {
  return (
    <section className="view active scrollable" aria-label="Access denied">
      <div className="panel" style={{ maxWidth: "36rem" }}>
        <div className="panel-head">
          <h3>{title}</h3>
        </div>
        <div className="panel-body">
          <p style={{ color: "var(--text-2)", marginBottom: "0.75rem" }}>
            You do not have permission to open this module. Contact your Managing Partner if you
            believe this is an error.
          </p>
          {permission && (
            <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "1rem" }}>
              Required permission: <code>{permission}</code>
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link href="/dashboard">
              <Button variant="primary">
                <Icon name="dashboard" style={{ marginRight: "0.35rem" }} />
                Back to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
