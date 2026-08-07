import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div className={["panel", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      {actions}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={["panel-body", className].filter(Boolean).join(" ")}>{children}</div>;
}
