"use client";

import { accessTicksFromNav, type AccessTick } from "@/lib/rbac/access-ticks";

const TICKS = accessTicksFromNav();
const ALL_CODES: string[] = TICKS.map((t) => t.code);

function withLockedUsersManage(codes: string[], lockUsersManage?: boolean) {
  if (!lockUsersManage) return codes;
  return [...new Set([...codes, "users.manage"])];
}

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

  const selectedSet = new Set(selected);
  const allSystemOn = ALL_CODES.every((code) => selectedSet.has(code));

  function toggle(code: string, on: boolean) {
    if (lockUsersManage && code === "users.manage" && !on) return;
    if (on) onChange([...new Set([...selected, code])]);
    else onChange(selected.filter((c) => c !== code));
  }

  function setAllSystem(on: boolean) {
    if (on) {
      onChange(withLockedUsersManage(ALL_CODES, lockUsersManage));
      return;
    }
    onChange(withLockedUsersManage([], lockUsersManage));
  }

  function setSectionAll(ticks: AccessTick[], on: boolean) {
    const sectionCodes: string[] = ticks.map((t) => t.code);
    if (on) {
      onChange(withLockedUsersManage([...new Set([...selected, ...sectionCodes])], lockUsersManage));
      return;
    }
    const drop = new Set<string>(sectionCodes);
    if (lockUsersManage) drop.delete("users.manage");
    onChange(selected.filter((c) => !drop.has(c)));
  }

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      <label
        style={{
          display: "flex",
          gap: "0.55rem",
          alignItems: "flex-start",
          fontSize: "0.9rem",
          fontWeight: 650,
          padding: "0.55rem 0.75rem",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          background: "var(--surface-2, var(--panel, transparent))",
        }}
      >
        <input
          type="checkbox"
          checked={allSystemOn}
          disabled={disabled}
          onChange={(e) => setAllSystem(e.target.checked)}
          style={{ marginTop: "0.2rem" }}
        />
        <span>
          Everything in the system
          <span className="muted" style={{ display: "block", fontSize: "0.75rem", fontWeight: 400 }}>
            Grants every module tick below (full desk access).
          </span>
        </span>
      </label>

      {[...grouped.entries()].map(([section, ticks]) => {
        const sectionCodes = ticks.map((t) => t.code);
        const sectionAllOn = sectionCodes.every((code) => selectedSet.has(code));
        const sectionSomeOn = sectionCodes.some((code) => selectedSet.has(code));

        return (
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
            <legend style={{ fontSize: "0.8rem", fontWeight: 650 }}>
              <label
                style={{
                  display: "inline-flex",
                  gap: "0.4rem",
                  alignItems: "center",
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={sectionAllOn}
                  ref={(el) => {
                    if (el) el.indeterminate = sectionSomeOn && !sectionAllOn;
                  }}
                  disabled={disabled}
                  onChange={(e) => setSectionAll(ticks, e.target.checked)}
                />
                <span>
                  {section}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {" "}
                    (all in module)
                  </span>
                </span>
              </label>
            </legend>
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
        );
      })}
      <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
        Help stays available with no tick.
      </p>
    </div>
  );
}
