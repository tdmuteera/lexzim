"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CheckMark, RepeatIcon, StarIcon } from "@/components/my-day/MyDayBits";
import { MyDayItemEditor } from "@/components/my-day/MyDayItemEditor";
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

type MenuPos = { top: number; left: number; maxHeight: number };

const MENU_WIDTH = 220;
const EDGE = 8;

function placeMenu(button: HTMLElement, menuHeight = 330): MenuPos {
  const r = button.getBoundingClientRect();
  const vh = window.innerHeight;
  const h = Math.min(menuHeight, vh - EDGE * 2);
  let top: number;
  if (vh - r.bottom - EDGE >= h + 6) top = r.bottom + 6;
  else if (r.top - 6 - h >= EDGE) top = r.top - 6 - h;
  else top = vh - h - EDGE;
  return {
    top: Math.max(EDGE, top),
    left: Math.max(EDGE, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - EDGE)),
    maxHeight: vh - EDGE * 2,
  };
}

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
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [pop, setPop] = useState(false);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuElRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);

  function openMenu() {
    if (!moreRef.current) return;
    moreRef.current.scrollIntoView({ block: "nearest" });
    setMenuPos(placeMenu(moreRef.current));
    setMenuOpen(true);
  }

  useLayoutEffect(() => {
    if (!menuOpen || !moreRef.current || !menuElRef.current) return;
    const next = placeMenu(moreRef.current, menuElRef.current.scrollHeight);
    setMenuPos((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuElRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const follow = (e: Event) => {
      if (e.target instanceof Node && menuElRef.current?.contains(e.target)) return;
      const btn = moreRef.current;
      if (!btn) return close();
      const r = btn.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return close();
      setMenuPos(placeMenu(btn, menuElRef.current?.scrollHeight));
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [menuOpen]);
  const tag = tagMeta(item.tag);
  const closed = item.status !== "open";
  const done = item.status === "done";
  const pending = item.id.startsWith("tmp-");

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

  if (editing) {
    return (
      <div className={`myday-item is-editing${compact ? " is-compact" : ""}`}>
        <MyDayItemEditor item={item} api={api} compact={compact} onDone={() => setEditing(false)} />
      </div>
    );
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
        pending ? "is-pending" : "",
      ].join(" ")}
      aria-busy={pending || undefined}
      draggable={draggable && !closed && !pending}
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
        <div
          className="myday-item-title"
          onDoubleClick={() => !closed && !pending && setEditing(true)}
          title={closed ? undefined : "Double-click to edit"}
        >
          {item.title}
        </div>
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
          ref={moreRef}
          onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
        {menuOpen && menuPos ? createPortal(
          <div
            ref={menuElRef}
            className="myday-menu is-floating"
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left, maxHeight: menuPos.maxHeight }}
          >
            {!closed ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                >
                  Edit
                </button>
                <div className="myday-menu-sep" />
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
          </div>,
          document.body,
        ) : null}
      </div>
    </div>
  );
}
