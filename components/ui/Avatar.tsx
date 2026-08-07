import type { HTMLAttributes } from "react";

export type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  initials: string;
  name?: string;
  role?: string;
  showMeta?: boolean;
};

export function Avatar({
  initials,
  name,
  role,
  showMeta = false,
  className = "",
  ...props
}: AvatarProps) {
  return (
    <div
      className={["user-chip", className].filter(Boolean).join(" ")}
      style={{ pointerEvents: "none" }}
      {...props}
    >
      <div className="user-avatar" aria-hidden="true">
        {initials.slice(0, 2).toUpperCase()}
      </div>
      {showMeta && (name || role) ? (
        <div className="user-meta">
          {name ? <strong>{name}</strong> : null}
          {role ? <span>{role}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
