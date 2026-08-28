"use client";

import { useMemo, useState } from "react";
import { initialsFromName } from "@/lib/utils/name";

export type SharePersonOption = {
  id: string;
  fullName: string;
  email?: string;
};

type CalendarSharePeoplePickerProps = {
  people: SharePersonOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function CalendarSharePeoplePicker({
  people,
  selectedIds,
  onChange,
  disabled,
}: CalendarSharePeoplePickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false),
    );
  }, [people, query]);

  const selectedPeople = useMemo(
    () => people.filter((p) => selectedIds.includes(p.id)),
    [people, selectedIds],
  );

  function toggle(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function remove(id: string) {
    if (disabled) return;
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div className="cal-share-people-picker">
      {selectedPeople.length > 0 ? (
        <div className="cal-share-people-chips" aria-label="Selected people">
          {selectedPeople.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cal-share-people-chip"
              disabled={disabled}
              onClick={() => remove(p.id)}
              aria-label={`Remove ${p.fullName}`}
            >
              <span className="cal-share-people-chip-avatar" aria-hidden="true">
                {initialsFromName(p.fullName)}
              </span>
              <span className="cal-share-people-chip-name">{p.fullName}</span>
              <span className="cal-share-people-chip-remove" aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="cal-share-people-toolbar">
        <input
          id="cal-share-people-search"
          type="search"
          className="cal-share-people-search"
          placeholder="Search people by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled || people.length === 0}
          aria-label="Search people to share with"
        />
        <span className="cal-share-people-count muted">
          {selectedIds.length} selected
        </span>
      </div>

      {people.length === 0 ? (
        <p className="cal-share-people-empty muted">
          No other active users available to share with.
        </p>
      ) : (
        <ul className="cal-share-people-list" role="listbox" aria-multiselectable="true">
          {filtered.length === 0 ? (
            <li className="cal-share-people-empty muted">No matching people.</li>
          ) : (
            filtered.map((person) => {
              const selected = selectedIds.includes(person.id);
              return (
                <li key={person.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={["cal-share-people-option", selected ? "selected" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={disabled}
                    onClick={() => toggle(person.id)}
                  >
                    <span className="cal-share-people-avatar" aria-hidden="true">
                      {initialsFromName(person.fullName)}
                    </span>
                    <span className="cal-share-people-option-body">
                      <span className="cal-share-people-option-name">{person.fullName}</span>
                      {person.email ? (
                        <span className="cal-share-people-option-meta">{person.email}</span>
                      ) : null}
                    </span>
                    <span className="cal-share-people-check" aria-hidden="true">
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
