import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "gold" | "danger";
type Size = "md" | "sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
};

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  gold: "btn-gold",
  danger: "btn-outline",
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  type = "button",
  style,
  children,
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    variantClass[variant],
    size === "sm" ? "btn-sm" : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      style={
        variant === "danger"
          ? { color: "var(--danger)", borderColor: "rgba(168,83,69,0.35)", ...style }
          : style
      }
      {...props}
    >
      {children}
    </button>
  );
}
