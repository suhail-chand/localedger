import { describe, expect, it } from "vitest";

import { generateOccurrences, occurrences } from "@/domain/recurrence";

describe("recurrence generation", () => {
  it("generates a once occurrence only inside the requested range", () => {
    const rule = {
      recurrence: { type: "once" } as const,
      startAt: "2026-01-15T12:00:00.000Z",
    };

    expect(
      occurrences(rule, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-31T23:59:59.999Z",
        timeZone: "UTC",
      }),
    ).toEqual(["2026-01-15T12:00:00.000Z"]);
  });

  it("generates daily occurrences from the start and applies end and range limits", () => {
    expect(
      generateOccurrences(
        {
          recurrence: { type: "every", n: 2, unit: "day" },
          startAt: "2026-03-01T12:00:00.000Z",
          endAt: "2026-03-08T12:00:00.000Z",
          maxEntries: 4,
        },
        {
          from: "2026-03-03T12:00:00.000Z",
          to: "2026-03-08T12:00:00.000Z",
          timeZone: "UTC",
        },
      ),
    ).toEqual([
      "2026-03-03T12:00:00.000Z",
      "2026-03-05T12:00:00.000Z",
      "2026-03-07T12:00:00.000Z",
    ]);
  });

  it("clamps monthly month-end occurrences without drifting", () => {
    expect(
      occurrences(
        {
          recurrence: { type: "every", n: 1, unit: "month" },
          startAt: "2024-01-31T12:00:00.000Z",
          maxEntries: 3,
        },
        { timeZone: "UTC" },
      ),
    ).toEqual([
      "2024-01-31T12:00:00.000Z",
      "2024-02-29T12:00:00.000Z",
      "2024-03-31T12:00:00.000Z",
    ]);
  });

  it("clamps leap-day yearly occurrences in non-leap years", () => {
    expect(
      occurrences(
        {
          recurrence: { type: "every", n: 1, unit: "year" },
          startAt: "2024-02-29T12:00:00.000Z",
          maxEntries: 3,
        },
        { timeZone: "UTC" },
      ),
    ).toEqual([
      "2024-02-29T12:00:00.000Z",
      "2025-02-28T12:00:00.000Z",
      "2026-02-28T12:00:00.000Z",
    ]);
  });

  it("generates weekly occurrences across local DST", () => {
    expect(
      occurrences(
        {
          recurrence: { type: "every", n: 1, unit: "week" },
          startAt: "2026-03-01T05:00:00.000Z",
          maxEntries: 3,
        },
        { timeZone: "America/New_York" },
      ),
    ).toEqual([
      "2026-03-01T05:00:00.000Z",
      "2026-03-08T05:00:00.000Z",
      "2026-03-15T04:00:00.000Z",
    ]);
  });

  it("supports standalone recurrence rules and endDate", () => {
    expect(
      occurrences(
        {
          type: "every",
          n: 1,
          unit: "month",
          start: "2026-12-31T12:00:00.000Z",
          endDate: "2027-02-28T12:00:00.000Z",
        },
        { timeZone: "UTC" },
      ),
    ).toEqual([
      "2026-12-31T12:00:00.000Z",
      "2027-01-31T12:00:00.000Z",
      "2027-02-28T12:00:00.000Z",
    ]);
  });

  it("rejects invalid ranges and recurrence counts", () => {
    expect(() =>
      occurrences(
        {
          recurrence: { type: "every", n: 0, unit: "day" },
          startAt: "2026-01-01T00:00:00.000Z",
        },
        { timeZone: "UTC" },
      ),
    ).toThrow(RangeError);

    expect(() =>
      occurrences(
        {
          recurrence: { type: "once" },
          startAt: "2026-01-01T00:00:00.000Z",
        },
        {
          from: "2026-02-01T00:00:00.000Z",
          to: "2026-01-01T00:00:00.000Z",
          timeZone: "UTC",
        },
      ),
    ).toThrow(RangeError);
  });
});
