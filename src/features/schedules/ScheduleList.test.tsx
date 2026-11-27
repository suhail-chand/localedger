import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ScheduledTransaction } from "@/domain/types";
import { ScheduleList } from "./ScheduleList";

function schedule(): ScheduledTransaction {
  const now = new Date("2026-11-27T10:00:00.000Z").toISOString();
  return {
    id: "10000000-0000-4000-8000-000000000001",
    createdAt: now,
    updatedAt: now,
    deleted: false,
    scheduleType: "recurring",
    template: {
      title: "Rent",
      occurredAt: now,
      currency: "INR",
      splits: [],
      labelIds: [],
      status: "cleared",
      note: "",
    },
    recurrence: { type: "every", n: 1, unit: "month" },
    startAt: "2026-11-01T10:00:00.000Z",
    autoRecord: false,
    status: "active",
  };
}

describe("ScheduleList", () => {
  it("shows overdue and occurrence actions", () => {
    render(
      <ScheduleList
        schedules={[schedule()]}
        occurrences={[]}
        filters={{ sort: "next_due" }}
        now={new Date("2026-11-27T10:00:00.000Z")}
        onEdit={vi.fn()}
        onPause={vi.fn()}
        onEnd={vi.fn()}
        onRecord={vi.fn()}
        onEditRecord={vi.fn()}
        onSkip={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record due" }),
    ).toBeInTheDocument();
  });
});
