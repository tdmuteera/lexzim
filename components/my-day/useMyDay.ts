"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  localToday,
  sortMyDayItems,
  type MyDayItemDto,
  type MyDayPayload,
} from "@/lib/my-day/shared";

type ApiBody<T> = {
  ok: boolean;
  data?: T;
  requestId?: string;
  error?: { message: string; requestId?: string };
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    keepalive: Boolean(init?.method && init.method !== "GET"),
    ...init,
  });
  const body = (await res.json().catch(() => ({ ok: false }))) as ApiBody<T>;
  if (!res.ok || !body.ok || body.data === undefined) {
    const ref = body.error?.requestId ?? body.requestId;
    throw new Error(
      `${body.error?.message ?? "Something went wrong."}${ref ? ` Reference: ${ref}` : ""}`,
    );
  }
  return body.data;
}

export type NewMyDayItem = {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  tag?: string | null;
  starred?: boolean;
  clientId?: string | null;
  matterId?: string | null;
  recurrence?: { rule: string; weekday?: number; monthDay?: number } | null;
};

export type ItemAction =
  | { action: "done" }
  | { action: "reopen" }
  | { action: "drop" }
  | { action: "move"; dueDate: string | null }
  | { action: "update"; fields: Partial<NewMyDayItem> };

function applyOptimistic(
  item: MyDayItemDto,
  op: ItemAction,
  today: string,
): MyDayItemDto {
  switch (op.action) {
    case "done":
      return { ...item, status: "done", completedOn: today };
    case "reopen":
      return { ...item, status: "open", completedOn: null };
    case "drop":
      return { ...item, status: "dropped", completedOn: today };
    case "move":
      return { ...item, status: "open", completedOn: null, dueDate: op.dueDate };
    case "update":
      return { ...item, ...(op.fields as Partial<MyDayItemDto>) };
  }
}

/**
 * Saves are tracked per browser tab, not per component, so a view mounted while
 * another view's save is still in flight (dashboard to My Day page) waits for it.
 */
const saves = { seq: 0, inFlight: 0, waiting: new Set<() => void>() };

function beginSave() {
  saves.seq += 1;
  saves.inFlight += 1;
}

function endSave() {
  saves.inFlight = Math.max(0, saves.inFlight - 1);
  if (saves.inFlight > 0 || !saves.waiting.size) return;
  const waiting = [...saves.waiting];
  saves.waiting.clear();
  for (const reload of waiting) reload();
}

export function useMyDay() {
  const [data, setData] = useState<MyDayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todayRef = useRef(localToday());
  const [initialToday] = useState(localToday);
  const hasData = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const [reloadLater] = useState(() => () => void loadRef.current());

  const load = useCallback(async () => {
    todayRef.current = localToday();
    const seq = saves.seq;
    try {
      const payload = await call<MyDayPayload>(`/api/my-day?today=${todayRef.current}`);
      // A snapshot that overlapped a save may predate it and would undo optimistic changes.
      const stale = seq !== saves.seq || saves.inFlight > 0;
      if (stale) {
        if (saves.inFlight > 0) saves.waiting.add(reloadLater);
        else void loadRef.current();
        if (hasData.current) return;
      }
      hasData.current = true;
      setData(payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load My Day.");
    } finally {
      setLoading(false);
    }
  }, [reloadLater]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => () => void saves.waiting.delete(reloadLater), [reloadLater]);

  useEffect(() => {
    void load();
    const onFocus = () => {
      if (localToday() !== todayRef.current) void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const add = useCallback(
    async (
      input: NewMyDayItem,
      labels?: { clientLabel: string | null; matterLabel: string | null },
    ) => {
      beginSave();
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!input.recurrence) {
        const temp: MyDayItemDto = {
          id: tempId,
          title: input.title,
          notes: input.notes ?? null,
          dueDate: input.dueDate ?? null,
          dueTime: input.dueTime ?? null,
          originalDate: input.dueDate ?? null,
          tag: input.tag ?? null,
          starred: Boolean(input.starred),
          status: "open",
          carriedCount: 0,
          completedOn: null,
          clientId: input.clientId ?? null,
          clientLabel: labels?.clientLabel ?? null,
          matterId: input.matterId ?? null,
          matterLabel: labels?.matterLabel ?? null,
          calendarEventId: null,
          recurrenceId: null,
          sortOrder: Number.MAX_SAFE_INTEGER,
        };
        setData((prev) => (prev ? { ...prev, items: [...prev.items, temp] } : prev));
      }
      try {
        const res = await call<{ item?: MyDayItemDto; payload?: MyDayPayload }>(
          "/api/my-day",
          {
            method: "POST",
            body: JSON.stringify({ ...input, today: todayRef.current }),
          },
        );
        if (res.item) {
          const fresh = res.item;
          setData((prev) => {
            if (!prev) return prev;
            const rest = prev.items.filter((i) => i.id !== tempId && i.id !== fresh.id);
            return { ...prev, items: [...rest, fresh] };
          });
        } else if (res.payload) {
          setData(res.payload);
        }
      } catch (e) {
        setData((prev) =>
          prev ? { ...prev, items: prev.items.filter((i) => i.id !== tempId) } : prev,
        );
        throw e;
      } finally {
        endSave();
      }
    },
    [],
  );

  const act = useCallback(
    async (id: string, op: ItemAction) => {
      beginSave();
      const today = todayRef.current;
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) =>
                i.id === id ? applyOptimistic(i, op, today) : i,
              ),
            }
          : prev,
      );
      const body =
        op.action === "update"
          ? { action: "update", today, ...op.fields }
          : { ...op, today };
      try {
        const res = await call<{ item: MyDayItemDto | null }>(`/api/my-day/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (res.item) {
          const fresh = res.item;
          setData((prev) =>
            prev
              ? { ...prev, items: prev.items.map((i) => (i.id === id ? fresh : i)) }
              : prev,
          );
        }
        if (op.action === "done" || op.action === "reopen") {
          void call<MyDayPayload>(`/api/my-day?today=${today}`)
            .then((p) => setData((prev) => (prev ? { ...prev, streak: p.streak } : p)))
            .catch(() => undefined);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update item.");
        void load();
      } finally {
        endSave();
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      beginSave();
      setData((prev) =>
        prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev,
      );
      try {
        await call(`/api/my-day/${id}`, { method: "DELETE" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete item.");
        void load();
      } finally {
        endSave();
      }
    },
    [load],
  );

  const promote = useCallback(
    async (
      id: string,
      opts: { startsAt: string; endsAt: string | null; allDay: boolean },
    ) => {
      beginSave();
      try {
        const res = await call<{ item: MyDayItemDto | null }>(
          `/api/my-day/${id}/calendar`,
          {
            method: "POST",
            body: JSON.stringify({ ...opts, today: todayRef.current }),
          },
        );
        if (res.item) {
          const fresh = res.item;
          setData((prev) =>
            prev
              ? { ...prev, items: prev.items.map((i) => (i.id === id ? fresh : i)) }
              : prev,
          );
        }
      } finally {
        endSave();
      }
    },
    [],
  );

  const stopRecurrence = useCallback(
    async (id: string) => {
      beginSave();
      const today = todayRef.current;
      setData((prev) =>
        prev
          ? {
              ...prev,
              recurrences: prev.recurrences.filter((r) => r.id !== id),
              items: prev.items.filter(
                (i) =>
                  !(
                    i.recurrenceId === id &&
                    i.status === "open" &&
                    (i.dueDate ?? "") >= today
                  ),
              ),
            }
          : prev,
      );
      try {
        await call(`/api/my-day/recurrences/${id}?today=${today}`, { method: "DELETE" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not stop repeating.");
        void load();
      } finally {
        endSave();
      }
    },
    [load],
  );

  const sorted = useMemo(
    () => (data ? { ...data, items: sortMyDayItems(data.items) } : null),
    [data],
  );

  return {
    data: sorted,
    today: data?.today ?? initialToday,
    loading,
    error,
    setError,
    reload: load,
    add,
    act,
    remove,
    promote,
    stopRecurrence,
  };
}

export type MyDayApi = ReturnType<typeof useMyDay>;
