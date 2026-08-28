"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";

type CommItem = {
  id: string;
  loggedAt: string;
  employeeName: string | null;
  channel: string;
  outcomeNotes: string;
  nextFollowUpAt: string | null;
};

function channelLabel(channel: string) {
  if (channel === "in_person") return "In person";
  if (channel === "phone") return "Phone";
  if (channel === "email") return "Email";
  return channel;
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DebtorCommunicationsPanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName?: string;
}) {
  const [items, setItems] = useState<CommItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<"phone" | "email" | "in_person">("phone");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [loggedAt, setLoggedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/finance/debtors/communications?clientId=${encodeURIComponent(clientId)}`,
        { credentials: "include" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: CommItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load communications.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load communications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/debtors/communications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          channel,
          outcomeNotes,
          loggedAt: loggedAt ? new Date(loggedAt).toISOString() : undefined,
          nextFollowUpAt: nextFollowUpAt
            ? new Date(nextFollowUpAt).toISOString()
            : null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save communication.");
        return;
      }
      setOutcomeNotes("");
      setNextFollowUpAt("");
      await load();
    } catch {
      setError("Could not save communication.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <h4 style={{ margin: "0 0 0.35rem" }}>
        Collection timeline{clientName ? ` · ${clientName}` : ""}
      </h4>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Log calls and visits so colleagues do not contact the same debtor blindly.
      </p>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </p>
      ) : null}

      <Can permission="billing.manage">
        <form
          onSubmit={onSubmit}
          className="toolbar"
          style={{ flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}
        >
          <input
            className="search-input"
            type="datetime-local"
            value={loggedAt}
            onChange={(e) => setLoggedAt(e.target.value)}
            aria-label="Date and time"
            required
          />
          <select
            className="filter-select"
            value={channel}
            onChange={(e) =>
              setChannel(e.target.value as "phone" | "email" | "in_person")
            }
            aria-label="Channel"
          >
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="in_person">In person</option>
          </select>
          <input
            className="search-input"
            placeholder="Outcome notes"
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            required
            style={{ minWidth: "200px", flex: 1 }}
          />
          <input
            className="search-input"
            type="datetime-local"
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
            aria-label="Next follow-up"
            title="Next follow-up"
          />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Log contact"}
          </Button>
        </form>
      </Can>

      {loading ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Loading timeline…
        </p>
      ) : items.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          No communications logged yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data data-dense">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>Channel</th>
                <th>Outcome</th>
                <th>Next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{formatWhen(item.loggedAt)}</td>
                  <td>{item.employeeName ?? "—"}</td>
                  <td>{channelLabel(item.channel)}</td>
                  <td>{item.outcomeNotes}</td>
                  <td>{formatWhen(item.nextFollowUpAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
