"use client";

import { useEffect, useRef, useState } from "react";
import type { MyDayApi } from "@/components/my-day/useMyDay";
import { MY_DAY_TAGS, type MyDayItemDto } from "@/lib/my-day/shared";

export function MyDayItemEditor({
  item,
  api,
  compact,
  onDone,
}: {
  item: MyDayItemDto;
  api: MyDayApi;
  compact?: boolean;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [time, setTime] = useState(item.dueTime ?? "");
  const [tag, setTag] = useState(item.tag ?? "");
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  function save() {
    const t = title.trim();
    if (!t) return;
    const fields: Record<string, string | null> = {};
    if (t !== item.title) fields.title = t;
    if ((notes.trim() || null) !== item.notes) fields.notes = notes.trim() || null;
    if ((time || null) !== item.dueTime) fields.dueTime = time || null;
    if ((tag || null) !== item.tag) fields.tag = tag || null;
    if (Object.keys(fields).length) void api.act(item.id, { action: "update", fields });
    onDone();
  }

  return (
    <form
      className={`myday-edit${compact ? " is-compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <input
        ref={titleRef}
        className="myday-edit-title"
        value={title}
        maxLength={300}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Title"
      />
      <textarea
        className="myday-edit-notes"
        value={notes}
        maxLength={2000}
        rows={2}
        placeholder="Notes (optional)"
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
        aria-label="Notes"
      />
      <div className="myday-edit-row">
        <input
          type="time"
          className="myday-edit-time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Time"
        />
        <div className="myday-add-tags">
          {MY_DAY_TAGS.map((t) => (
            <button
              key={t.code}
              type="button"
              className={`myday-tagpick${tag === t.code ? " is-on" : ""}`}
              style={{ "--myday-tag": t.color } as React.CSSProperties}
              onClick={() => setTag(tag === t.code ? "" : t.code)}
            >
              <i />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="myday-edit-actions">
        <button type="button" className="myday-edit-cancel" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="myday-add-go" disabled={!title.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}
