"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CheckMark, RepeatIcon, StarIcon, useOutsideClose } from "@/components/my-day/MyDayBits";
import type { MyDayApi } from "@/components/my-day/useMyDay";
import { addDays, friendlyDay, nextMonday, tagMeta, type MyDayItemDto } from "@/lib/my-day/shared";

type Props = {
  item: MyDayItemDto;
  api: MyDayApi;
  today: string;
  compact?: boolean;
  showDate?: boolean;
  draggable?: boolean;
  onPromote?: (item: MyDayItemDto) => void;
  canPromote?: boolean;
};

export function MyDayItemRow({
  item,
  api,
  today,
  compact,
  showDate,
  draggable,
  onPromote,
  canPromote,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pop, setPop] = useState(false);
  const close = useCallback(() => setMenuOpen(false), []);
  const menuRef = useOutsideClose<HTMLDivElement>(menuOpen, close);
  const tag = tagMeta(item.tag);
  const closed = item.status !== "open";
  const done = item.status === "done";

  function toggle() {
    if (item.status === "moved") return;
    if (done || item.status === "dropped") {
      void api.act(item.id, { action: "reopen" });
    } else {
      setPop(true);
      window.setTimeout(() => setPop(false), 600);
      void api.act(item.id, { action: "done" });
    }
  }

  function move(dueDate: string | null) {
    setMenuOpen(false);
    void api.act(item.id, { action: "move", dueDate });
  }

  return (
    <div
      className={[
        "myday-item",
        compact ? "is-compact" : "",
        done ? "is-done" : "",
        item.status === "dropped" ? "is-dropped" : "",
        item.status === "moved" ? "is-moved" : "",
        pop ? "is-pop" : "",
      ].join(" ")}
      draggable={draggable && !closed}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/myday-item", item.id);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("is-dragging");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("is-dragging")}
      style={tag ? ({ "--myday-tag": tag.color } as React.CSSProperties) : undefined}
    >
      <button
        type="button"
        className="myday-tick"
        onClick={toggle}
        aria-label={done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
        aria-pressed={done}
        disabled={item.status === "moved"}
      >
        <CheckMark />
      </button>

      <div className="myday-item-body">
        <div className="myday-item-title">{item.title}</div>
        <div className="myday-item-meta">
          {item.status === "moved" ? <span className="myday-chip is-cal">On calendar</span> : null}
          {item.status === "dropped" ? <span className="myday-chip">Won&apos;t do</span> : null}
          {showDate && item.dueDate ? (
            <span className="myday-chip is-date">{friendlyDay(item.dueDate, today)}</span>
          ) : null}
          {item.dueTime ? <span className="myday-chip is-time">{item.dueTime}</span> : null}
          {tag ? (
            <span className="myday-chip is-tag">
              <i style={{ background: tag.color }} />
              {tag.label}
            </span>
          ) : null}
          {item.carriedCount > 0 && item.status === "open" ? (
            <span className="myday-chip is-carried" title="Rolled over from an earlier day">
              Carried over{item.carriedCount > 1 ? ` ×${item.carriedCount}` : ""}
            </span>
          ) : null}
          {item.recurrenceId ? (
            <span className="myday-chip is-repeat" title="Repeating item">
              <RepeatIcon />
            </span>
          ) : null}
          {!compact && item.clientId && item.clientLabel ? (
            <Link className="myday-chip is-link" href={`/clients/${item.clientId}`}>
              {item.clientLabel}
            </Link>
          ) : null}
          {!compact && item.matterId && item.matterLabel ? (
            <Link className="myday-chip is-link" href={`/matters/${item.matterId}`}>
              {item.matterLabel}
            </Link>
          ) : null}
        </div>
        {!compact && item.notes ? <div className="myday-item-notes">{item.notes}</div> : null}
      </div>

      {!closed ? (
        <button
          type="button"
          className={`myday-star${item.starred ? " is-on" : ""}`}
          onClick={() =>
            void api.act(item.id, { action: "update", fields: { starred: !item.starred } })
          }
          aria-label={item.starred ? "Remove priority star" : "Mark as priority"}
          title={item.starred ? "Priority" : "Mark as priority"}
        >
          <StarIcon filled={item.starred} />
        </button>
      ) : null}

      <div className="myday-menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="myday-more"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
        {menuOpen ? (
          <div className="myday-menu" role="menu">
            {!closed ? (
              <>
                <div className="myday-menu-label">Push to</div>
                {item.dueDate !== addDays(today, 1) ? (
                  <button type="button" role="menuitem" onClick={() => move(addDays(today, 1))}>
                    Tomorrow
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => move(nextMonday(today))}>
                  Next week (Mon)
                </button>
                {item.dueDate !== today ? (
                  <button type="button" role="menuitem" onClick={() => move(today)}>
                    Today
                  </button>
                ) : null}
                {item.dueDate ? (
                  <button type="button" role="menuitem" onClick={() => move(null)}>
                    Someday
                  </button>
                ) : null}
                <label className="myday-menu-date">
                  <span>Pick a date</span>
                  <input
                    type="date"
                    min={today}
                    onChange={(e) => e.target.value && move(e.target.value)}
                  />
                </label>
                <div className="myday-menu-sep" />
                {canPromote && onPromote ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onPromote(item);
                    }}
                  >
                    Move to calendar
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void api.act(item.id, { action: "drop" });
                  }}
                >
                  Won&apos;t do
                </button>
              </>
            ) : item.status !== "moved" ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void api.act(item.id, { action: "reopen" });
                }}
              >
                Reopen
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => {
                setMenuOpen(false);
                if (window.confirm(`Delete "${item.title}"?`)) void api.remove(item.id);
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
