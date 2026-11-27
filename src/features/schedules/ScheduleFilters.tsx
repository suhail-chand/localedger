import { useEffect, useRef } from "react";

import { Button } from "@/components/Button";

export type ScheduleFilterState = {
  search?: string;
  scheduleTypes?: ("one_time" | "recurring" | "emi")[];
  statuses?: ("active" | "paused" | "completed")[];
  occurrenceStates?: ("due" | "overdue" | "recorded" | "skipped")[];
  sort?: "next_due" | "title" | "recent";
};

type ScheduleFiltersProps = {
  filters: ScheduleFilterState;
  onChange: (filters: ScheduleFilterState) => void;
};

export function ScheduleFilters({ filters, onChange }: ScheduleFiltersProps) {
  function toggle<T extends string>(
    field: "scheduleTypes" | "statuses" | "occurrenceStates",
    value: T,
    checked: boolean,
  ): void {
    const selected = (filters[field] as T[] | undefined) ?? [];
    onChange({
      ...filters,
      [field]: checked
        ? [...selected, value]
        : selected.filter((item) => item !== value),
    });
  }

  return (
    <details className="rounded-xl border border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        Search and filters
      </summary>
      <div className="grid gap-4 pt-2 sm:grid-cols-2">
        <label className="text-sm">
          Search
          <input
            type="search"
            value={filters.search ?? ""}
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label className="text-sm">
          Sort
          <select
            value={filters.sort ?? "next_due"}
            onChange={(event) =>
              onChange({
                ...filters,
                sort: event.target.value as ScheduleFilterState["sort"],
              })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="next_due">Next due</option>
            <option value="title">Title</option>
            <option value="recent">Recently updated</option>
          </select>
        </label>
        <MultiSelect
          label="Recurrence"
          options={[
            ["one_time", "One-time"],
            ["recurring", "Recurring"],
            ["emi", "EMI"],
          ]}
          selected={filters.scheduleTypes ?? []}
          onToggle={(value, checked) => toggle("scheduleTypes", value, checked)}
        />
        <MultiSelect
          label="Status"
          options={[
            ["active", "Active"],
            ["paused", "Paused"],
            ["completed", "Completed"],
          ]}
          selected={filters.statuses ?? []}
          onToggle={(value, checked) => toggle("statuses", value, checked)}
        />
        <MultiSelect
          label="Occurrence"
          options={[
            ["due", "Due"],
            ["overdue", "Overdue"],
            ["recorded", "Recorded"],
            ["skipped", "Skipped"],
          ]}
          selected={filters.occurrenceStates ?? []}
          onToggle={(value, checked) =>
            toggle("occurrenceStates", value, checked)
          }
        />
      </div>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => onChange({ sort: "next_due" })}
      >
        Clear filters
      </Button>
    </details>
  );
}

function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  selected: readonly T[];
  onToggle: (value: T, checked: boolean) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summary =
    selected.length > 0
      ? `${selected.length} selected`
      : `All ${label.toLocaleLowerCase()}`;

  useEffect(() => {
    function dismissOutside(event: Event): void {
      const details = detailsRef.current;
      if (details?.open && !event.composedPath().includes(details)) {
        details.open = false;
      }
    }

    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("click", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("click", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  return (
    <div className="min-w-0 text-sm">
      <span className="mb-1 block">{label}</span>
      <details ref={detailsRef} className="relative min-w-0">
        <summary
          aria-label={`${label} filter`}
          className="flex min-h-11 min-w-0 cursor-pointer items-center justify-between rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-950"
        >
          <span className="min-w-0 truncate text-gray-500">{summary}</span>
        </summary>
        <fieldset className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-gray-300 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-950">
          <legend className="sr-only">{label}</legend>
          {options.map(([value, optionLabel]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={(event) => onToggle(value, event.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              <span>{optionLabel}</span>
            </label>
          ))}
        </fieldset>
      </details>
    </div>
  );
}
