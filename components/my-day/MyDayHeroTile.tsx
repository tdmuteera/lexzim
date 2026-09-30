"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Confetti, FlameIcon, ProgressRing } from "@/components/my-day/MyDayBits";
import { MyDayItemRow } from "@/components/my-day/MyDayItemRow";
import { MyDayPromoteModal } from "@/components/my-day/MyDayPromoteModal";
import { MyDayQuickAdd } from "@/components/my-day/MyDayQuickAdd";
import { MyDayMotivation } from "@/components/my-day/MyDayMotivation";
import { useMyDay } from "@/components/my-day/useMyDay";
import { addDays, friendlyDay, tagMeta, type MyDayItemDto } from "@/lib/my-day/shared";

const SCROLL_HINT_AT = 6;

function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function MyDayHeroTile() {
  const api = useMyDay();
  const { can } = useAuth();
  const [promoting, setPromoting] = useState<MyDayItemDto | null>(null);
  const today = api.today;

  const { todayItems, openCount, doneCount, total, carriedCount, upcoming, upNext } = useMemo(() => {
    const items = api.data?.items ?? [];
    const todays = items.filter((i) => i.dueDate === today && i.status !== "dropped");
    const open = todays.filter((i) => i.status === "open");
    const done = todays.filter((i) => i.status === "done" || i.status === "moved");
    const future = items.filter(
      (i) => i.status === "open" && i.dueDate && i.dueDate > today && i.dueDate <= addDays(today, 14),
    );
    return {
      upNext: future.slice(0, 3),
      todayItems: [...open, ...done],
      openCount: open.length,
      doneCount: done.length,
      total: todays.length,
      carriedCount: open.filter((i) => i.carriedCount > 0).length,
      upcoming: future.length,
    };
  }, [api.data, today]);

  const allDone = total > 0 && openCount === 0;
  const streak = api.data?.streak ?? 0;

  const headline = !total
    ? "What matters most today?"
    : allDone
      ? "Everything done. Brilliant work."
      : openCount === 1
        ? "One thing left. Finish strong."
        : `${openCount} things to go. You've got this.`;

  return (
    <section className={`myday-hero${allDone ? " is-complete" : ""}`} aria-label="My Day">
      {allDone ? <Confetti key={`c-${doneCount}`} /> : null}
      <div className="myday-hero-glow" aria-hidden />

      <div className="myday-hero-left">
        <div className="myday-kicker">
          <span className="myday-kicker-dot" /> My Day
        </div>
        <h3 className="myday-hero-date">{longDate(today)}</h3>
        <p className="myday-hero-headline">{headline}</p>
        {api.loading ? null : <MyDayMotivation open={openCount} total={total} />}

        <div className="myday-hero-stats">
          <ProgressRing done={doneCount} total={total} />
          <div className="myday-hero-pills">
            <span className={`myday-pill is-streak${streak ? "" : " is-zero"}`}>
              <FlameIcon />
              {streak ? `${streak}-day streak` : "Start a streak"}
            </span>
            {carriedCount ? (
              <span className="myday-pill is-carried">{carriedCount} carried over</span>
            ) : null}
            <Link href="/workflow/my-day" className="myday-pill is-plan">
              {upcoming ? `${upcoming} planned next 14 days` : "Plan the next 14 days"}
            </Link>
          </div>
        </div>
        {upNext.length ? (
          <div className="myday-upnext">
            <div className="myday-upnext-title">Coming up</div>
            {upNext.map((i) => (
              <div key={i.id} className="myday-upnext-row">
                <i style={tagMeta(i.tag) ? { background: tagMeta(i.tag)!.color } : undefined} />
                <span>{i.title}</span>
                <em>{friendlyDay(i.dueDate!, today)}</em>
              </div>
            ))}
          </div>
        ) : null}
        <p className="myday-hero-private">Private to you. No emails, not on the shared calendar.</p>
      </div>

      <div className="myday-hero-right">
        {api.error ? (
          <p className="myday-error" role="alert">
            {api.error}
          </p>
        ) : null}

        <div className="myday-hero-list">
          {api.loading ? (
            <>
              <div className="myday-skel" />
              <div className="myday-skel" />
              <div className="myday-skel" />
            </>
          ) : todayItems.length ? (
            todayItems.map((item) => (
                <MyDayItemRow
                  key={item.id}
                  item={item}
                  api={api}
                  today={today}
                  compact
                  canPromote={can("calendar.manage")}
                  onPromote={setPromoting}
                />
              ))
          ) : (
            <div className="myday-empty">
              <strong>Your day is a blank page.</strong>
              <span>Add the first thing you want to get done. Unfinished items roll over to tomorrow.</span>
            </div>
          )}
        </div>
        {todayItems.length > SCROLL_HINT_AT ? (
          <div className="myday-scroll-hint">
            {todayItems.length} items today. Scroll the list to see them all.
          </div>
        ) : null}

        <MyDayQuickAdd api={api} today={today} variant="hero" />

        <div className="myday-hero-foot">
          <Link href="/workflow/my-day">Open My Day</Link>
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
