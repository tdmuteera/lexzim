import type { ReactNode } from "react";

type HrPageShellProps = {
  title: string;
  subtitle?: string;
  ariaLabel: string;
  actions?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
};

export function HrPageShell({
  title,
  subtitle,
  ariaLabel,
  actions,
  summary,
  children,
}: HrPageShellProps) {
  return (
    <section className="view active scrollable hr-desk-view" aria-label={ariaLabel}>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p className="panel-subtitle muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="hr-panel-actions">{actions}</div> : null}
        </div>
        <div className="panel-body hr-panel-body">
          {summary}
          {children}
        </div>
      </div>
    </section>
  );
}
