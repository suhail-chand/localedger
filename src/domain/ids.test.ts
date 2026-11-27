import { describe, expect, it } from "vitest";

import {
  createDeterministicUuid,
  createOccurrenceId,
  createOccurrenceRecordId,
  createScheduledTransactionId,
  createUuidV4,
  isUtcIsoString,
  isUuid,
  toUtcIso,
  utcIsoSchema,
} from "@/domain/ids";

describe("UUID helpers", () => {
  it("creates a valid UUID v4 and rejects invalid inputs", () => {
    const uuid = createUuidV4(Array.from({ length: 16 }, (_, index) => index));

    expect(uuid).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(isUuid(uuid)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(() => createUuidV4([1])).toThrow(RangeError);
  });

  it("rejects byte values outside 0-255", () => {
    expect(() => createUuidV4(Array.from({ length: 16 }, () => 256))).toThrow(
      RangeError,
    );
  });

  it("creates stable v4-shaped IDs for schedule occurrences", () => {
    const scheduled = createScheduledTransactionId(
      "11111111-1111-4111-8111-111111111111",
      "2026-11-26T10:00:00.000Z",
    );
    const occurrence = createOccurrenceRecordId(
      "11111111-1111-4111-8111-111111111111",
      "2026-11-26T10:00:00.000Z",
    );

    expect(scheduled).toBe(
      createScheduledTransactionId(
        "11111111-1111-4111-8111-111111111111",
        "2026-11-26T10:00:00.000Z",
      ),
    );
    expect(occurrence).toBe(
      createOccurrenceId(
        "11111111-1111-4111-8111-111111111111",
        "2026-11-26T10:00:00.000Z",
      ),
    );
    expect(isUuid(scheduled)).toBe(true);
    expect(isUuid(occurrence)).toBe(true);
    expect(scheduled).not.toBe(occurrence);
  });

  it("rejects empty deterministic UUID input", () => {
    expect(() => createDeterministicUuid("")).toThrow(RangeError);
  });
});

describe("UTC timestamp helpers", () => {
  it("accepts canonical UTC ISO timestamps", () => {
    expect(isUtcIsoString("2026-11-26T16:58:42.348Z")).toBe(true);
    expect(utcIsoSchema.safeParse("2026-11-26T16:58:42.348Z").success).toBe(
      true,
    );
  });

  it("rejects local, offset, non-canonical, and invalid timestamps", () => {
    expect(isUtcIsoString("2026-11-26T16:58:42")).toBe(false);
    expect(isUtcIsoString("2026-11-26T16:58:42+05:30")).toBe(false);
    expect(isUtcIsoString("2026-11-26T16:58:42Z")).toBe(false);
    expect(isUtcIsoString("2026-02-30T16:58:42.348Z")).toBe(false);
  });

  it("converts valid Dates and rejects invalid Dates", () => {
    expect(toUtcIso(new Date("2026-11-26T16:58:42.348Z"))).toBe(
      "2026-11-26T16:58:42.348Z",
    );
    expect(() => toUtcIso(new Date(Number.NaN))).toThrow(RangeError);
  });
});
