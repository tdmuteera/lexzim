"use client";

import type { MyDayApi } from "@/components/my-day/useMyDay";
import { addDays, friendlyDay } from "@/lib/my-day/shared";

export function MyDayReviewPanel({ api, today }: { api: MyDayApi; today: string }) {
  const review = api.data?.review;
  if (!review?.show) return null;

  const carried = (api.data?.items ?? []).filter(
    (i) => i.status === "open" && review.carried.some((c) => c.id === i.id),
  );
  const since = review.sinceDate ? friendlyDay(review.sinceDate, today).toLowerCase() : "yesterday";

  return (
    <div className="myday-review" role="region" aria-label="Daily review">
      <div className="myday-review-head">
        <div>
          <div className="myday-review-kicker">Morning review</div>
          <h4>
            {review.doneCount > 0
              ? `You finished ${review.doneCount} item${review.doneCount === 1 ? "" : "s"} since ${since}.`
              : "A fresh day."}{" "}
            {carried.length
              ? `${carried.length} carried over to today.`
              : "Nothing carried over."}
          </h4>
          {review.missedRecurring > 0 ? (
            <p>
              {review.missedRecurring} repeating item{review.missedRecurring === 1 ? " was" : "s were"}{" "}
              missed and closed. The next ones are already planned.
            </p>
          ) : null}
        </div>
        <button type="button" className="myday-review-done" onClick={() => void api.finishReview()}>
          {carried.length ? "Keep the rest for today" : "Got it"}
        </button>
      </div>

      {carried.length ? (
        <ul className="myday-review-list">
          {carried.map((item) => (
            <li key={item.id}>
              <span className="myday-review-title">
                {item.title}
                {item.carriedCount > 1 ? (
                  <em> carried {item.carriedCount} times</em>
                ) : null}
              </span>
              <span className="myday-review-actions">
                <button type="button" onClick={() => void api.act(item.id, { action: "done" })}>
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => void api.act(item.id, { action: "move", dueDate: addDays(today, 1) })}
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => void api.act(item.id, { action: "move", dueDate: null })}
                >
                  Someday
                </button>
                <button
                  type="button"
                  className="is-muted"
                  onClick={() => void api.act(item.id, { action: "drop" })}
                >
                  Drop
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
