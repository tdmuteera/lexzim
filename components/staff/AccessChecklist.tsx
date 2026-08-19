"use client";

import { accessTicksFromNav, type AccessTick } from "@/lib/rbac/access-ticks";

const TICKS = accessTicksFromNav();

export function AccessChecklist({
  selected,
  onChange,
  disabled,
  lockUsersManage,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  lockUsersManage?: boolean;
}) {
  const grouped = new Map<string, AccessTick[]>();
  for (const tick of TICKS) {
    const list = grouped.get(tick.section) ?? [];
    list.push(tick);
    grouped.set(tick.section, list);
  }

  function toggle(code: string, on: boolean) {
    if (lockUsersManage && code === "users.manage" && !on) return;
    if (on) onChange([...new Set([...selected, code])]);
    else onChange(selected.filter((c) => c !== code));
  }

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      {[...grouped.entries()].map(([section, ticks]) => (
        <fieldset
          key={section}
          disabled={disabled}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "0.65rem 0.85rem",
            margin: 0,
          }}
        >
          <legend style={{ fontSize: "0.8rem", fontWeight: 650 }}>{section}</legend>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            {ticks.map((tick) => {
              const locked = lockUsersManage && tick.code === "users.manage";
              return (
                <label
                  key={tick.code}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                    fontSize: "0.88rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(tick.code)}
                    disabled={disabled || locked}
                    onChange={(e) => toggle(tick.code, e.target.checked)}
                    style={{ marginTop: "0.2rem" }}
                  />
                  <span>
                    {tick.label}
                    {tick.hint ? (
                      <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                        {tick.hint}
                      </span>
                    ) : null}
                    {locked ? (
                      <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                        Required for this account.
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
        Help stays available with no tick.
      </p>
    </div>
  );
}
