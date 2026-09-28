"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Confetti, FlameIcon, ProgressRing, RepeatIcon } from "@/components/my-day/MyDayBits";
import { MyDayItemRow } from "@/components/my-day/MyDayItemRow";
import { MyDayPromoteModal } from "@/components/my-day/MyDayPromoteModal";
import { MyDayQuickAdd } from "@/components/my-day/MyDayQuickAdd";
import { MyDayReviewPanel } from "@/components/my-day/MyDayReviewPanel";
import { useMyDay, type MyDayApi } from "@/components/my-day/useMyDay";
import {
  addDays,
  friendlyDay,
  recurrenceLabel,
  tagMeta,
  type MyDayItemDto,
} from "@/lib/my-day/shared";

function DropZone({
  api,
  target,
  className,
  children,
}: {
  api: MyDayApi;
  target: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData("text/myday-item");
    if (!id) return;
    const item = api.data?.items.find((i) => i.id === id);
    if (!item || item.dueDate === target) return;
    void api.act(id, { action: "move", dueDate: target });
  }
  return (
    <div
      className={`${className ?? ""}${over ? " is-over" : ""}`}
      onDragOverCapture={(e) => {
        if (!e.dataTransfer.types.includes("text/myday-item")) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDropCapture={(e) => {
        if (!e.dataTransfer.types.includes("text/myday-item")) return;
        e.stopPropagation();
        onDrop(e);
      }}
    >
      {children}
    </div>
  );
}

export function MyDayView() {
  const api = useMyDay();
  const { can } = useAuth();
  const canPromote = can("calendar.manage");
  const [promoting, setPromoting] = useState<MyDayItemDto | null>(null);
  const [showDone, setShowDone] = useState(false);
  const today = api.today;
  const tomorrow = addDays(today, 1);

  const groups = useMemo(() => {
    const items = api.data?.items ?? [];
    const open = items.filter((i) => i.status === "open");
    const todayAll = items.filter((i) => i.dueDate === today && i.status !== "dropped");
    const closedToday = items.filter((i) => i.status !== "open" && i.completedOn === today);
    const byDay = new Map<string, MyDayItemDto[]>();
    for (let n = 2; n <= 14; n++) byDay.set(addDays(today, n), []);
    for (const i of open) {
      if (i.dueDate && byDay.has(i.dueDate)) byDay.get(i.dueDate)!.push(i);
    }
    return {
      todayOpen: open.filter((i) => i.dueDate === today),
      todayDoneCount: todayAll.filter((i) => i.status === "done" || i.status === "moved").length,
      todayTotal: todayAll.length,
      closedToday,
      tomorrow: open.filter((i) => i.dueDate === tomorrow),
      next: [...byDay.entries()],
      later: open.filter((i) => i.dueDate && i.dueDate > addDays(today, 14)),
      someday: open.filter((i) => !i.dueDate),
      carried: open.filter((i) => i.dueDate === today && i.carriedCount > 0).length,
      starred: open.filter((i) => i.starred).length,
    };
  }, [api.data, today, tomorrow]);

  const allDone = groups.todayTotal > 0 && groups.todayOpen.length === 0;
  const streak = api.data?.streak ?? 0;

  const row = (item: MyDayItemDto, showDate = false) => (
    <MyDayItemRow
      key={item.id}
      item={item}
      api={api}
      today={today}
      draggable
      showDate={showDate}
      canPromote={canPromote}
      onPromote={setPromoting}
    />
  );

  return (
    <section className="view active scrollable myday-page" aria-label="My Day">
      <div className={`myday-hero is-page${allDone ? " is-complete" : ""}`}>
        {allDone ? <Confetti key={`c-${groups.todayDoneCount}`} /> : null}
        <div className="myday-hero-glow" aria-hidden />
        <div className="myday-hero-left">
          <div className="myday-kicker">
            <span className="myday-kicker-dot" /> My Day
          </div>
          <h3 className="myday-hero-date">
            {new Date(`${today}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h3>
          <p className="myday-hero-headline">
            Your private to-do list. Plan today and the next two weeks. Nothing here sends emails
            or appears on the shared calendar.
          </p>
          <div className="myday-hero-pills">
            <span className={`myday-pill is-streak${streak ? "" : " is-zero"}`}>
              <FlameIcon />
              {streak ? `${streak}-day streak` : "Start a streak"}
            </span>
            {groups.carried ? (
              <span className="myday-pill is-carried">{groups.carried} carried over</span>
            ) : null}
            {groups.starred ? <span className="myday-pill">{groups.starred} priority</span> : null}
          </div>
        </div>
        <div className="myday-hero-ringwrap">
          <ProgressRing done={groups.todayDoneCount} total={groups.todayTotal} size={128} stroke={11} />
        </div>
      </div>

      {api.error ? (
        <p className="myday-error" role="alert">
          {api.error}
        </p>
      ) : null}

      <MyDayReviewPanel api={api} today={today} />

      <div className="myday-card">
        <MyDayQuickAdd api={api} today={today} variant="page" />
      </div>

      <p className="myday-hint">
        Tip: drag an item onto another day to move it. Unfinished items roll over to the next day
        automatically.
      </p>

      <div className="myday-board">
        <DropZone api={api} target={today} className="myday-col is-today">
          <div className="myday-col-head">
            <h4>Today</h4>
            <span>
              {groups.todayOpen.length} open
            </span>
          </div>
          <div className="myday-col-list">
            {api.loading ? (
              <>
                <div className="myday-skel" />
                <div className="myday-skel" />
              </>
            ) : groups.todayOpen.length ? (
              groups.todayOpen.map((i) => row(i))
            ) : (
              <div className="myday-col-empty">
                {groups.todayTotal ? "All clear for today." : "Nothing planned. Add something above."}
              </div>
            )}
          </div>
          {groups.closedToday.length ? (
            <div className="myday-done-block">
              <button type="button" className="myday-done-toggle" onClick={() => setShowDone((v) => !v)}>
                {showDone ? "Hide" : "Show"} finished today ({groups.closedToday.length})
              </button>
              {showDone ? groups.closedToday.map((i) => row(i)) : null}
            </div>
          ) : null}
        </DropZone>

        <DropZone api={api} target={tomorrow} className="myday-col">
          <div className="myday-col-head">
            <h4>Tomorrow</h4>
            <span>
              {new Date(`${tomorrow}T00:00:00Z`).toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })}
            </span>
          </div>
          <div className="myday-col-list">
            {groups.tomorrow.length ? (
              groups.tomorrow.map((i) => row(i))
            ) : (
              <div className="myday-col-empty">Drop items here for tomorrow.</div>
            )}
          </div>
          <MyDayQuickAdd
            api={api}
            today={today}
            variant="hero"
            defaultDate={tomorrow}
            placeholder="Add for tomorrow…"
          />
        </DropZone>

        <div className="myday-col is-plan">
          <div className="myday-col-head">
            <h4>Next 14 days</h4>
            <span>
              {groups.next.reduce((n, [, list]) => n + list.length, 0)} planned
            </span>
          </div>
          <div className="myday-days">
            {groups.next.map(([day, list]) => (
              <DropZone key={day} api={api} target={day} className="myday-day">
                <div className="myday-day-head">
                  <strong>{friendlyDay(day, today)}</strong>
                  {list.length ? <span>{list.length}</span> : null}
                </div>
                {list.length ? (
                  list.map((i) => row(i))
                ) : (
                  <div className="myday-day-empty">Drop here</div>
                )}
              </DropZone>
            ))}
          </div>
        </div>
      </div>

      <div className="myday-lower">
        <DropZone api={api} target={null} className="myday-card myday-someday">
          <div className="myday-col-head">
            <h4>Someday</h4>
            <span>No date yet</span>
          </div>
          <div className="myday-col-list">
            {groups.someday.length ? (
              groups.someday.map((i) => row(i))
            ) : (
              <div className="myday-col-empty">
                Ideas and things without a date. Drop items here to park them.
              </div>
            )}
          </div>
          <MyDayQuickAdd
            api={api}
            today={today}
            variant="hero"
            defaultDate={null}
            placeholder="Park an idea for someday…"
          />
          {groups.later.length ? (
            <>
              <div className="myday-col-head" style={{ marginTop: "1rem" }}>
                <h4>Later</h4>
                <span>Beyond 14 days</span>
              </div>
              <div className="myday-col-list">{groups.later.map((i) => row(i, true))}</div>
            </>
          ) : null}
        </DropZone>

        <div className="myday-card myday-repeats">
          <div className="myday-col-head">
            <h4>Repeating</h4>
            <span>{api.data?.recurrences.length ?? 0}</span>
          </div>
          {api.data?.recurrences.length ? (
            <ul>
              {api.data.recurrences.map((r) => {
                const tag = tagMeta(r.tag);
                return (
                  <li key={r.id}>
                    <span className="myday-repeat-icon">
                      <RepeatIcon />
                    </span>
                    <div>
                      <strong>{r.title}</strong>
                      <span>
                        {recurrenceLabel(r)}
                        {r.dueTime ? ` at ${r.dueTime}` : ""}
                        {tag ? ` · ${tag.label}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Stop repeating "${r.title}"? Future copies are removed.`)) {
                          void api.stopRecurrence(r.id);
                        }
                      }}
                    >
                      Stop
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="myday-col-empty">
              Use Options, then Repeat, when adding an item: e.g. a social media post every Monday.
            </div>
          )}
        </div>
      </div>

      <MyDayPromoteModal
        item={promoting}
        api={api}
        today={today}
        onClose={() => setPromoting(null)}
      />
    </section>
  );
}
