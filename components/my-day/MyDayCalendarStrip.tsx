"use client";

import Link from "next/link";
import { CheckMark } from "@/components/my-day/MyDayBits";
import { useMyDay } from "@/components/my-day/useMyDay";
import { tagMeta } from "@/lib/my-day/shared";

/** Private My Day strip on the calendar page. Items never become calendar events here. */
export function MyDayCalendarStrip() {
  const api = useMyDay();
  const today = api.today;
  const items = (api.data?.items ?? []).filter(
    (i) => i.dueDate === today && (i.status === "open" || i.status === "done"),
  );
  const done = items.filter((i) => i.status === "done").length;

  if (api.loading || api.error) return null;

  return (
    <div className="myday-strip" aria-label="My Day today (private)">
      <div className="myday-strip-head">
        <span className="myday-kicker-dot" />
        <strong>My Day</strong>
        <span className="myday-strip-count">
          {items.length ? `${done}/${items.length} done` : "Nothing planned"}
        </span>
        <span className="myday-strip-private">Only you can see this</span>
        <Link href="/workflow/my-day" className="myday-strip-open">
          Open
        </Link>
      </div>
      {items.length ? (
        <div className="myday-strip-items">
          {items.map((i) => {
            const tag = tagMeta(i.tag);
            const isDone = i.status === "done";
            return (
              <button
                key={i.id}
                type="button"
                className={`myday-strip-chip${isDone ? " is-done" : ""}`}
                style={tag ? ({ "--myday-tag": tag.color } as React.CSSProperties) : undefined}
                onClick={() => void api.act(i.id, { action: isDone ? "reopen" : "done" })}
                title={isDone ? "Mark not done" : "Mark done"}
              >
                <span className="myday-strip-tick">
                  <CheckMark />
                </span>
                {i.dueTime ? <em>{i.dueTime}</em> : null}
                {i.title}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
