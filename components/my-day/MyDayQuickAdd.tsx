"use client";

import { useId, useState, type FormEvent } from "react";
import { MatterSearchPicker } from "@/components/ai/MatterSearchPicker";
import { ClientSearchPicker } from "@/components/finance/ClientSearchPicker";
import { StarIcon } from "@/components/my-day/MyDayBits";
import type { MyDayApi } from "@/components/my-day/useMyDay";
import { addDays, MY_DAY_RULES, MY_DAY_TAGS } from "@/lib/my-day/shared";

type Props = {
  api: MyDayApi;
  today: string;
  variant?: "hero" | "page";
  defaultDate?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
};

export function MyDayQuickAdd({
  api,
  today,
  variant = "page",
  defaultDate,
  placeholder,
  autoFocus,
  onCancel,
}: Props) {
  const [title, setTitle] = useState("");
  const [more, setMore] = useState(false);
  const [when, setWhen] = useState<"today" | "tomorrow" | "date" | "someday">("today");
  const [date, setDate] = useState(addDays(today, 2));
  const [time, setTime] = useState("");
  const [tag, setTag] = useState<string>("");
  const [starred, setStarred] = useState(false);
  const [repeat, setRepeat] = useState("none");
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [matterLabel, setMatterLabel] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uid = useId();

  function resolveDate(): string | null {
    if (!more) return defaultDate === undefined ? today : defaultDate;
    if (when === "today") return today;
    if (when === "tomorrow") return addDays(today, 1);
    if (when === "date") return date || today;
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setErr(null);
    const dueDate = resolveDate();
    const repeating = more && repeat !== "none" && dueDate !== null;
    const payload = {
      title: t,
      dueDate,
      dueTime: more && time ? time : null,
      tag: tag || null,
      starred,
      notes: more && notes.trim() ? notes.trim() : null,
      clientId: more && clientId ? clientId : null,
      matterId: more && matterId ? matterId : null,
      recurrence: repeating ? { rule: repeat } : null,
    };
    const labels = {
      clientLabel: payload.clientId ? clientLabel : null,
      matterLabel: payload.matterId ? matterLabel : null,
    };
    setTitle("");
    setNotes("");
    setTime("");
    setTag("");
    setRepeat("none");
    setStarred(false);
    setClientId("");
    setMatterId("");
    setClientLabel(null);
    setMatterLabel(null);
    if (repeating) setBusy(true);
    try {
      await api.add(payload, labels);
    } catch (e2) {
      setTitle((cur) => cur || t);
      setErr(e2 instanceof Error ? e2.message : "Could not add.");
    } finally {
      if (repeating) setBusy(false);
    }
  }

  return (
    <form className={`myday-add is-${variant}`} onSubmit={(e) => void submit(e)}>
      <div className="myday-add-row">
        <span className="myday-add-plus" aria-hidden>
          +
        </span>
        <input
          className="myday-add-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder ?? "Add something for today… press Enter"}
          maxLength={300}
          aria-label="New to-do"
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onCancel) {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <button
          type="button"
          className={`myday-add-star${starred ? " is-on" : ""}`}
          onClick={() => setStarred((v) => !v)}
          aria-label="Priority"
          title="Priority"
        >
          <StarIcon filled={starred} />
        </button>
        <button
          type="button"
          className={`myday-add-more${more ? " is-on" : ""}`}
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
        >
          {more ? "Less" : "Options"}
        </button>
        <button type="submit" className="myday-add-go" disabled={!title.trim()}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>

      {variant === "page" || more || title.trim() ? (
        <div className="myday-add-tags" role="group" aria-label="Tag">
          {MY_DAY_TAGS.map((t) => (
            <button
              key={t.code}
              type="button"
              className={`myday-tagpick${tag === t.code ? " is-on" : ""}`}
              style={{ "--myday-tag": t.color } as React.CSSProperties}
              onClick={() => setTag((cur) => (cur === t.code ? "" : t.code))}
            >
              <i />
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {more ? (
        <div className="myday-add-options">
          <div className="myday-seg" role="radiogroup" aria-label="When">
            {(
              [
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["date", "Pick date"],
                ["someday", "Someday"],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={when === code}
                className={when === code ? "is-on" : ""}
                onClick={() => setWhen(code)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="myday-add-grid">
            {when === "date" ? (
              <label>
                <span>Date</span>
                <input
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            ) : null}
            <label>
              <span>Time (optional)</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label>
              <span>Repeat</span>
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                disabled={when === "someday"}
              >
                <option value="none">Does not repeat</option>
                {MY_DAY_RULES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="myday-add-grid is-links">
            <div>
              <ClientSearchPicker
                value={clientId}
                onChange={(id, opt) => {
                  setClientId(id);
                  setClientLabel(opt ? opt.title.replace(/^CL\d+\s*\u00b7\s*/, "") : null);
                }}
                label="Link a client (optional)"
                inputId={`myday-client-${uid}`}
              />
            </div>
            <div>
              <span className="myday-field-label">Link a matter (optional)</span>
              <MatterSearchPicker
                value={matterId}
                onChange={(id, opt) => {
                  setMatterId(id);
                  setMatterLabel(
                    opt ? (opt.matterNumber ? `${opt.matterNumber} \u00b7 ${opt.title}` : opt.title) : null,
                  );
                }}
              />
            </div>
          </div>
          <label className="myday-add-notes">
            <span>Notes</span>
            <textarea
              rows={2}
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember"
            />
          </label>
        </div>
      ) : null}

      {err ? (
        <p className="myday-error" role="alert">
          {err}
        </p>
      ) : null}
    </form>
  );
}
