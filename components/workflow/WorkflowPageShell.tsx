import type { ReactNode } from "react";

type WorkflowPageShellProps = {
  title: string;
  subtitle?: string;
  ariaLabel: string;
  actions?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
};

export function WorkflowPageShell({
  title,
  subtitle,
  ariaLabel,
  actions,
  summary,
  children,
}: WorkflowPageShellProps) {
  return (
    <section className="view active scrollable wf-desk-view" aria-label={ariaLabel}>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p className="panel-subtitle muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="wf-panel-actions">{actions}</div> : null}
        </div>
        <div className="panel-body wf-panel-body">
          {summary}
          {children}
        </div>
      </div>
    </section>
  );
}
