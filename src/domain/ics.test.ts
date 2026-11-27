import { describe, expect, it } from "vitest";

import {
  buildIcsCalendar,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
} from "@/domain/ics";
import type { ScheduledTransaction } from "@/domain/types";
import { toPaise } from "@/domain/money";

function schedule(
  changes: Partial<ScheduledTransaction> = {},
): ScheduledTransaction {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deleted: false,
    scheduleType: "recurring",
    template: {
      title: "Rent",
      occurredAt: "2026-01-01T10:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          type: "expense",
          amount: toPaise(250000),
          accountId: "33333333-3333-4333-8333-333333333333",
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    },
    recurrence: { type: "every", n: 1, unit: "month" },
    startAt: "2026-01-31T10:30:00.000Z",
    endAt: "2026-04-30T10:30:00.000Z",
    autoRecord: false,
    status: "active",
    ...changes,
  };
}

describe("ICS export", () => {
  it("escapes text and uses CRLF", () => {
    expect(escapeIcsText("A;B,C\\D\nNext")).toBe("A\\;B\\,C\\\\D\\nNext");
    const calendar = buildIcsCalendar([schedule()], {
      dtstamp: "2026-01-01T00:00:00.000Z",
    });
    expect(calendar.endsWith("\r\n")).toBe(true);
    expect(calendar).not.toMatch(/(?<!\r)\n/);
  });

  it("folds lines at 75 octets", () => {
    const line = `SUMMARY:${"A".repeat(100)}`;
    const folded = foldIcsLine(line);
    const physicalLines = folded.split("\r\n");
    expect(
      physicalLines.every(
        (part) => new TextEncoder().encode(part).length <= 75,
      ),
    ).toBe(true);
    expect(physicalLines.slice(1).every((part) => part.startsWith(" "))).toBe(
      true,
    );
  });

  it("formats UTC timestamps", () => {
    expect(formatIcsUtc("2026-01-31T10:30:00.000Z")).toBe("20260131T103000Z");
  });

  it("maps recurrence units and COUNT", () => {
    for (const unit of ["day", "week", "month", "year"] as const) {
      const calendar = buildIcsCalendar(
        [
          schedule({
            maxEntries: 4,
            endAt: undefined,
            recurrence: { type: "every", n: 2, unit },
          }),
        ],
        { dtstamp: "2026-01-01T00:00:00.000Z" },
      );
      const frequency =
        unit === "day"
          ? "DAILY"
          : unit === "week"
            ? "WEEKLY"
            : unit === "month"
              ? "MONTHLY"
              : "YEARLY";
      expect(calendar).toContain(`RRULE:FREQ=${frequency};INTERVAL=2;COUNT=4`);
    }
  });

  it("maps an end date to UNTIL", () => {
    const calendar = buildIcsCalendar([schedule()], {
      dtstamp: "2026-01-01T00:00:00.000Z",
    });
    expect(calendar).toContain(
      "RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20260430T103000Z",
    );
  });

  it("creates one-time events without RRULE", () => {
    const calendar = buildIcsCalendar(
      [schedule({ recurrence: { type: "once" }, endAt: undefined })],
      { dtstamp: "2026-01-01T00:00:00.000Z" },
    );
    expect(calendar).not.toContain("RRULE:");
  });

  it("uses stable UID and custom alarm", () => {
    const calendar = buildIcsCalendar([schedule()], {
      dtstamp: "2026-01-01T00:00:00.000Z",
      leadMinutes: 90,
    });
    expect(calendar).toContain(
      "UID:11111111-1111-4111-8111-111111111111@localedger",
    );
    expect(calendar).toContain("TRIGGER:-PT90M");
  });

  it("exports one EMI event per instalment", () => {
    const emiSchedules = [1, 2, 3].map((index) =>
      schedule({
        scheduleType: "emi",
        seriesId: "44444444-4444-4444-8444-444444444444",
        recurrence: { type: "every", n: 1, unit: "month" },
        emi: {
          index: index - 1,
          principal: toPaise(10000 * index),
          interest: toPaise(1000),
          tax: toPaise(180),
        },
      }),
    );
    const calendar = buildIcsCalendar(emiSchedules, {
      dtstamp: "2026-01-01T00:00:00.000Z",
    });
    expect(calendar.match(/BEGIN:VEVENT/g)?.length).toBe(3);
    expect(calendar).toContain("Principal: \u20B9100.00");
    expect(calendar).toContain("UID:11111111-1111-4111-8111-111111111111-1@");
  });

  it("matches a full-calendar snapshot", () => {
    const calendar = buildIcsCalendar([schedule()], {
      dtstamp: "2026-01-01T00:00:00.000Z",
      leadMinutes: 1440,
    });
    expect(calendar).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Localedger//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        "UID:11111111-1111-4111-8111-111111111111@localedger",
        "DTSTAMP:20260101T000000Z",
        "DTSTART:20260131T103000Z",
        "RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20260430T103000Z",
        "SUMMARY:Pay: Rent (\u20B92\\,500.00)",
        "DESCRIPTION:",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT1440M",
        "DESCRIPTION:Pay: Rent (\u20B92\\,500.00)",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ]
        .join("\r\n")
        .replace(
          "DESCRIPTION:\r\nBEGIN:VALARM",
          "DESCRIPTION:\r\nBEGIN:VALARM",
        ),
    );
  });
});
