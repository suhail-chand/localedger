import { format } from "date-fns";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { occurrences } from "@/domain/recurrence";
import type { OccurrenceRecord, ScheduledTransaction } from "@/domain/types";
import type { IcsDeliveryResult } from "./icsDelivery";
import type { ScheduleFilterState } from "./ScheduleFilters";

type ScheduleListProps = {
  schedules: ScheduledTransaction[];
  occurrences: OccurrenceRecord[];
  filters: ScheduleFilterState;
  now?: Date;
  delivery?: { scheduleId: string; result: IcsDeliveryResult } | null;
  onEdit: (schedule: ScheduledTransaction) => void;
  onPause: (schedule: ScheduledTransaction) => void;
  onEnd: (schedule: ScheduledTransaction) => void;
  onRecord: (schedule: ScheduledTransaction, occurrenceAt: string) => void;
  onEditRecord: (schedule: ScheduledTransaction, occurrenceAt: string) => void;
  onSkip: (schedule: ScheduledTransaction, occurrenceAt: string) => void;
  onExport: (schedule: ScheduledTransaction) => void;
};

type ScheduleRow = {
  schedule: ScheduledTransaction;
  related: OccurrenceRecord[];
  nextOccurrenceAt?: string;
  states: Set<"due" | "overdue" | "recorded" | "skipped">;
};

export function ScheduleList({
  schedules,
  occurrences: allOccurrences,
  filters,
  now = new Date(),
  delivery,
  onEdit,
  onPause,
  onEnd,
  onRecord,
  onEditRecord,
  onSkip,
  onExport,
}: ScheduleListProps) {
  const rows: ScheduleRow[] = schedules.map((schedule) => {
    const related = allOccurrences.filter(
      (occurrence) =>
        occurrence.scheduleId === schedule.id && !occurrence.deleted,
    );
    const handled = new Set(related.map((item) => item.occurrenceAt));
    const intervalMilliseconds =
      schedule.recurrence.type === "once"
        ? 86_400_000
        : schedule.recurrence.n *
          (schedule.recurrence.unit === "day"
            ? 86_400_000
            : schedule.recurrence.unit === "week"
              ? 604_800_000
              : schedule.recurrence.unit === "month"
                ? 2_678_400_000
                : 31_622_400_000);
    const horizon = new Date(
      Math.max(now.getTime(), new Date(schedule.startAt).getTime()) +
        intervalMilliseconds +
        86_400_000,
    ).toISOString();
    const possibleOccurrences = occurrences(
      {
        recurrence: schedule.recurrence,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        maxEntries: schedule.maxEntries,
      },
      { to: horizon },
    );
    const nextOccurrenceAt = possibleOccurrences.find(
      (occurrenceAt) => !handled.has(occurrenceAt),
    );
    const states = new Set<
      ScheduleRow["states"] extends Set<infer T> ? T : never
    >();
    for (const occurrence of related) {
      states.add(occurrence.outcome);
    }
    if (schedule.status === "active" && nextOccurrenceAt) {
      if (nextOccurrenceAt <= now.toISOString()) {
        states.add(
          nextOccurrenceAt <
            new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
            ? "overdue"
            : "due",
        );
      }
    }
    return { schedule, related, nextOccurrenceAt, states };
  });

  const filtered = rows
    .filter(
      ({ schedule }) =>
        !filters.search ||
        schedule.template.title
          .toLowerCase()
          .includes(filters.search.toLowerCase()),
    )
    .filter(
      ({ schedule }) =>
        !filters.scheduleTypes?.length ||
        filters.scheduleTypes.includes(schedule.scheduleType),
    )
    .filter(
      ({ schedule }) =>
        !filters.statuses?.length || filters.statuses.includes(schedule.status),
    )
    .filter(
      ({ states }) =>
        !filters.occurrenceStates?.length ||
        filters.occurrenceStates.some((state) => states.has(state)),
    )
    .sort((left, right) => {
      if (filters.sort === "title") {
        return left.schedule.template.title.localeCompare(
          right.schedule.template.title,
        );
      }
      if (filters.sort === "recent") {
        return right.schedule.updatedAt.localeCompare(left.schedule.updatedAt);
      }
      return (
        (left.nextOccurrenceAt ?? "9999").localeCompare(
          right.nextOccurrenceAt ?? "9999",
        ) ||
        left.schedule.template.title.localeCompare(
          right.schedule.template.title,
        )
      );
    });

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No scheduled transactions"
        description="Create a schedule or clear the filters."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {filtered.map(({ schedule, related, nextOccurrenceAt, states }) => {
        const due =
          schedule.status === "active" &&
          nextOccurrenceAt !== undefined &&
          nextOccurrenceAt <= now.toISOString();
        const overdue =
          due &&
          nextOccurrenceAt <
            new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const deliveryMessage =
          delivery?.scheduleId === schedule.id
            ? delivery.result === "shared"
              ? "Reminder calendar shared."
              : delivery.result === "downloaded"
                ? "Reminder calendar downloaded."
                : ""
            : "";

        return (
          <li
            key={schedule.id}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <button
              type="button"
              onClick={() => onEdit(schedule)}
              className="w-full text-left"
            >
              <p className="font-semibold">{schedule.template.title}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {schedule.scheduleType === "emi"
                  ? "EMI"
                  : schedule.recurrence.type === "once"
                    ? "One-time"
                    : "Recurring"}{" "}
                · {schedule.status}
              </p>
              <p className="mt-1 text-sm">
                Next due:{" "}
                {nextOccurrenceAt
                  ? format(new Date(nextOccurrenceAt), "PPP p")
                  : "No upcoming entries"}
              </p>
              {due ? (
                <p
                  className={
                    overdue
                      ? "mt-1 text-sm font-medium text-red-700 dark:text-red-300"
                      : "mt-1 text-sm font-medium text-amber-700 dark:text-amber-300"
                  }
                >
                  {overdue ? "Overdue" : "Due"}
                </p>
              ) : null}
            </button>
            {related.length > 0 ? (
              <p className="mt-2 text-xs text-gray-500">
                {related.filter((item) => item.outcome === "recorded").length}{" "}
                recorded ·{" "}
                {related.filter((item) => item.outcome === "skipped").length}{" "}
                skipped
              </p>
            ) : null}
            {states.has("recorded") || states.has("skipped") ? (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {states.has("recorded") ? "Recorded" : "Skipped"}
              </p>
            ) : null}
            {deliveryMessage ? (
              <p role="status" className="mt-2 text-sm text-green-700">
                {deliveryMessage}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {due && nextOccurrenceAt ? (
                <>
                  <Button onClick={() => onRecord(schedule, nextOccurrenceAt)}>
                    Record due
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onEditRecord(schedule, nextOccurrenceAt)}
                  >
                    Edit then record
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onSkip(schedule, nextOccurrenceAt)}
                  >
                    Skip
                  </Button>
                </>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => onExport(schedule)}
                aria-label={`Export .ics for ${schedule.template.title}`}
              >
                Export .ics
              </Button>
              {schedule.status === "active" ? (
                <Button variant="secondary" onClick={() => onPause(schedule)}>
                  Pause
                </Button>
              ) : null}
              {schedule.status !== "completed" ? (
                <Button variant="secondary" onClick={() => onEnd(schedule)}>
                  End
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
