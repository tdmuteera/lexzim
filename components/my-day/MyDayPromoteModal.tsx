"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { MyDayApi } from "@/components/my-day/useMyDay";
import type { MyDayItemDto } from "@/lib/my-day/shared";

function toLocalInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 9, mm ?? 0, 0);
}

type Props = {
  item: MyDayItemDto | null;
  api: MyDayApi;
  today: string;
  onClose: () => void;
};

export function MyDayPromoteModal(props: Props) {
  if (!props.item) return null;
  return <PromoteDialog key={props.item.id} {...props} item={props.item} />;
}

function oneHourLater(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${String(Math.min(23, (h ?? 9) + 1)).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
}

function PromoteDialog({ item, api, today, onClose }: Props & { item: MyDayItemDto }) {
  const [date, setDate] = useState(item.dueDate ?? today);
  const [start, setStart] = useState(item.dueTime ?? "09:00");
  const [end, setEnd] = useState(oneHourLater(item.dueTime ?? "09:00"));
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const startsAt = allDay ? toLocalInstant(date, "00:00") : toLocalInstant(date, start);
      const endsAt = allDay ? toLocalInstant(date, "23:59") : toLocalInstant(date, end);
      await api.promote(item.id, {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        allDay,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add to calendar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="Move to calendar"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Adding…" : "Add to calendar"}
          </Button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        <strong>{item.title}</strong> becomes a private calendar event and follows normal calendar
        reminders. It leaves your My Day list.
      </p>
      <div className="myday-add-grid">
        <label>
          <span>Date</span>
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {!allDay ? (
          <>
            <label>
              <span>Start</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              <span>End</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </>
        ) : null}
      </div>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All day
      </label>
      {err ? (
        <p className="myday-error" role="alert">
          {err}
        </p>
      ) : null}
    </Modal>
  );
}
