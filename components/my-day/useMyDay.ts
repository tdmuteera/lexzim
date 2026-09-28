"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localToday, type MyDayItemDto, type MyDayPayload } from "@/lib/my-day/shared";

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
    ...init,
  });
  const body = (await res.json().catch(() => ({ ok: false }))) as ApiBody<T>;
  if (!res.ok || !body.ok || body.data === undefined) {
    const ref = body.error?.requestId ?? body.requestId;
    throw new Error(`${body.error?.message ?? "Something went wrong."}${ref ? ` Reference: ${ref}` : ""}`);
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

function applyOptimistic(item: MyDayItemDto, op: ItemAction, today: string): MyDayItemDto {
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

export function useMyDay() {
  const [data, setData] = useState<MyDayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todayRef = useRef(localToday());
  const [initialToday] = useState(localToday);

  const load = useCallback(async () => {
    todayRef.current = localToday();
    try {
      const payload = await call<MyDayPayload>(`/api/my-day?today=${todayRef.current}`);
      setData(payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load My Day.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => {
      if (localToday() !== todayRef.current) void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const add = useCallback(async (input: NewMyDayItem) => {
    const payload = await call<MyDayPayload>("/api/my-day", {
      method: "POST",
      body: JSON.stringify({ ...input, today: todayRef.current }),
    });
    setData(payload);
  }, []);

  const act = useCallback(
    async (id: string, op: ItemAction) => {
      const today = todayRef.current;
      setData((prev) =>
        prev
          ? { ...prev, items: prev.items.map((i) => (i.id === id ? applyOptimistic(i, op, today) : i)) }
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
            prev ? { ...prev, items: prev.items.map((i) => (i.id === id ? fresh : i)) } : prev,
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
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      setData((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev));
      try {
        await call(`/api/my-day/${id}`, { method: "DELETE" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete item.");
        void load();
      }
    },
    [load],
  );

  const promote = useCallback(
    async (id: string, opts: { startsAt: string; endsAt: string | null; allDay: boolean }) => {
      const res = await call<{ item: MyDayItemDto | null }>(`/api/my-day/${id}/calendar`, {
        method: "POST",
        body: JSON.stringify({ ...opts, today: todayRef.current }),
      });
      if (res.item) {
        const fresh = res.item;
        setData((prev) =>
          prev ? { ...prev, items: prev.items.map((i) => (i.id === id ? fresh : i)) } : prev,
        );
      }
    },
    [],
  );

  const finishReview = useCallback(async () => {
    setData((prev) => (prev ? { ...prev, review: { ...prev.review, show: false } } : prev));
    await call("/api/my-day/review", {
      method: "POST",
      body: JSON.stringify({ today: todayRef.current }),
    }).catch(() => undefined);
  }, []);

  const stopRecurrence = useCallback(
    async (id: string) => {
      await call(`/api/my-day/recurrences/${id}?today=${todayRef.current}`, { method: "DELETE" });
      await load();
    },
    [load],
  );

  return {
    data,
    today: data?.today ?? initialToday,
    loading,
    error,
    setError,
    reload: load,
    add,
    act,
    remove,
    promote,
    finishReview,
    stopRecurrence,
  };
}

export type MyDayApi = ReturnType<typeof useMyDay>;
