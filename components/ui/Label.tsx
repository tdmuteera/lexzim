import type { LabelHTMLAttributes, ReactNode } from "react";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
};

export function Label({ className = "", children, ...props }: LabelProps) {
  return (
    <label className={className} {...props}>
      {children}
    </label>
  );
}
