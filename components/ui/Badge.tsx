import type { HTMLAttributes, ReactNode } from "react";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?:
    | "default"
    | "open"
    | "pending"
    | "danger"
    | "closed"
    | "individual"
    | "company";
  children: ReactNode;
};

const toneClass: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "",
  open: "badge-open",
  pending: "badge-pending",
  danger: "badge-danger",
  closed: "badge-closed",
  individual: "badge-individual",
  company: "badge-company",
};

export function Badge({ tone = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={["badge", toneClass[tone], className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
