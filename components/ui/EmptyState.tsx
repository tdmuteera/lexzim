import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

type EmptyStateProps = {
  title: string;
  detail?: string;
  icon?: "search" | "folder" | "users" | "list" | "check";
  action?: ReactNode;
};

export function EmptyState({
  title,
  detail,
  icon = "folder",
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Icon name={icon} className="ico" />
      <div style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: "0.25rem" }}>
        {title}
      </div>
      {detail ? <p style={{ margin: 0 }}>{detail}</p> : null}
      {action ? <div style={{ marginTop: "0.75rem" }}>{action}</div> : null}
    </div>
  );
}
