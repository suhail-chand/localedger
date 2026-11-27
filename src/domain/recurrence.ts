import { toUtcIso } from "@/domain/ids";

export type Recurrence =
  | { type: "once" }
  | {
      type: "every";
      n: number;
      unit: "day" | "week" | "month" | "year";
    };

export interface RecurrenceRule {
  recurrence: Recurrence;
  startAt: string;
  endAt?: string;
  maxEntries?: number;
}

export interface OccurrenceOptions {
  from?: string | Date;
  to?: string | Date;
  timeZone?: string;
  startAt?: string;
  start?: string;
  endAt?: string;
  endDate?: string;
  maxEntries?: number;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

function assertUtcIso(value: string): void {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new RangeError(`Invalid UTC ISO timestamp: ${value}`);
  }
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new RangeError("Invalid Date");
    }
    return new Date(value);
  }
  assertUtcIso(value);
  return new Date(value);
}

function getTimeZone(timeZone?: string): string {
  if (timeZone) {
    return timeZone;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getWallParts(date: Date, timeZone: string): WallParts {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
    millisecond: date.getUTCMilliseconds(),
  };
}

function wallPartsToUtc(parts: WallParts, timeZone: string): Date {
  let candidate = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = getWallParts(candidate, timeZone);
    const desiredAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    );
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      actual.millisecond,
    );
    const adjustment = desiredAsUtc - actualAsUtc;
    if (adjustment === 0) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + adjustment);
  }

  return candidate;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addLocalUnits(
  start: WallParts,
  recurrence: Extract<Recurrence, { type: "every" }>,
  index: number,
  timeZone: string,
): Date {
  const step = recurrence.n * index;

  if (recurrence.unit === "day") {
    const target = new Date(
      Date.UTC(
        start.year,
        start.month - 1,
        start.day + step,
        start.hour,
        start.minute,
        start.second,
        start.millisecond,
      ),
    );
    const parts = getWallParts(target, "UTC");
    return wallPartsToUtc(parts, timeZone);
  }

  if (recurrence.unit === "week") {
    const target = new Date(
      Date.UTC(
        start.year,
        start.month - 1,
        start.day + step * 7,
        start.hour,
        start.minute,
        start.second,
        start.millisecond,
      ),
    );
    const parts = getWallParts(target, "UTC");
    return wallPartsToUtc(parts, timeZone);
  }

  if (recurrence.unit === "month") {
    const targetMonthIndex = start.month - 1 + step;
    const year = start.year + Math.floor(targetMonthIndex / 12);
    const monthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const month = monthIndex + 1;
    const day = Math.min(start.day, daysInMonth(year, month));
    return wallPartsToUtc(
      {
        year,
        month,
        day,
        hour: start.hour,
        minute: start.minute,
        second: start.second,
        millisecond: start.millisecond,
      },
      timeZone,
    );
  }

  const year = start.year + step;
  const month = start.month;
  const day = Math.min(start.day, daysInMonth(year, month));
  return wallPartsToUtc(
    {
      year,
      month,
      day,
      hour: start.hour,
      minute: start.minute,
      second: start.second,
      millisecond: start.millisecond,
    },
    timeZone,
  );
}

function normalizeRule(
  rule:
    | RecurrenceRule
    | Recurrence
    | ((Recurrence | { recurrence: Recurrence }) & OccurrenceOptions),
  options: OccurrenceOptions,
):
  | {
      recurrence: Recurrence;
      startAt: string;
      endAt?: string;
      maxEntries?: number;
    }
  | never {
  const withRecurrence = "recurrence" in rule ? rule.recurrence : rule;
  const startAt =
    "startAt" in rule && typeof rule.startAt === "string"
      ? rule.startAt
      : "start" in rule && typeof rule.start === "string"
        ? rule.start
        : (options.startAt ?? options.start);
  const endAt =
    "endAt" in rule && typeof rule.endAt === "string"
      ? rule.endAt
      : "endDate" in rule && typeof rule.endDate === "string"
        ? rule.endDate
        : (options.endAt ?? options.endDate);
  const maxEntries =
    "maxEntries" in rule && typeof rule.maxEntries === "number"
      ? rule.maxEntries
      : options.maxEntries;

  if (!startAt) {
    throw new RangeError("Recurrence start is required");
  }
  assertUtcIso(startAt);
  if (endAt) {
    assertUtcIso(endAt);
  }
  if (
    maxEntries !== undefined &&
    (!Number.isInteger(maxEntries) || maxEntries < 1)
  ) {
    throw new RangeError("maxEntries must be a positive integer");
  }
  if (
    withRecurrence.type === "every" &&
    (!Number.isInteger(withRecurrence.n) || withRecurrence.n < 1)
  ) {
    throw new RangeError("Recurrence step must be a positive integer");
  }
  return { recurrence: withRecurrence, startAt, endAt, maxEntries };
}

export function occurrences(
  rule:
    | RecurrenceRule
    | Recurrence
    | ((Recurrence | { recurrence: Recurrence }) & OccurrenceOptions),
  options: OccurrenceOptions = {},
): string[] {
  const normalized = normalizeRule(rule, options);
  const timeZone = getTimeZone(options.timeZone);
  const start = toDate(normalized.startAt);
  const startParts = getWallParts(start, timeZone);
  const end = normalized.endAt ? toDate(normalized.endAt) : undefined;
  const from = options.from ? toDate(options.from) : undefined;
  const to = options.to ? toDate(options.to) : undefined;

  if (from && to && from.getTime() > to.getTime()) {
    throw new RangeError("Occurrence range start must not exceed its end");
  }

  const limit = normalized.maxEntries ?? Number.POSITIVE_INFINITY;
  const generated: string[] = [];

  if (normalized.recurrence.type === "once") {
    if (
      (!end || start.getTime() <= end.getTime()) &&
      (!from || start.getTime() >= from.getTime()) &&
      (!to || start.getTime() <= to.getTime())
    ) {
      generated.push(normalized.startAt);
    }
    return generated;
  }

  const recurrence = normalized.recurrence;
  let index = 0;
  while (generated.length < limit) {
    const occurrence =
      index === 0
        ? start
        : addLocalUnits(startParts, recurrence, index, timeZone);
    if (end && occurrence.getTime() > end.getTime()) {
      break;
    }
    if (!to || occurrence.getTime() <= to.getTime()) {
      if (!from || occurrence.getTime() >= from.getTime()) {
        generated.push(toUtcIso(occurrence));
      }
    } else {
      break;
    }
    index += 1;

    if (index > 100000) {
      throw new RangeError("Recurrence generated too many occurrences");
    }
  }

  return generated;
}

export function generateOccurrences(
  rule:
    | RecurrenceRule
    | Recurrence
    | ((Recurrence | { recurrence: Recurrence }) & OccurrenceOptions),
  options: OccurrenceOptions = {},
): string[] {
  return occurrences(rule, options);
}
