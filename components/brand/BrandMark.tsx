import type { CSSProperties, HTMLAttributes } from "react";

export type BrandMarkProps = HTMLAttributes<HTMLDivElement> & {
  initials?: string;
  size?: "sm" | "md" | "lg";
};

const sizeStyle: Record<NonNullable<BrandMarkProps["size"]>, CSSProperties> = {
  sm: { width: 36, height: 36, fontSize: "0.78rem", marginBottom: 0 },
  md: { width: 52, height: 52, fontSize: "1.15rem" },
  lg: { width: 64, height: 64, fontSize: "1.5rem" },
};

export function BrandMark({
  initials = "TP",
  size = "lg",
  className = "",
  style,
  ...props
}: BrandMarkProps) {
  return (
    <div
      className={["login-mark", className].filter(Boolean).join(" ")}
      style={{ ...sizeStyle[size], ...style }}
      aria-hidden="true"
      {...props}
    >
      {initials}
    </div>
  );
}
