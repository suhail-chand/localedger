import { formatInr } from "@/domain/money";
import type { Paise, ScheduledTransaction, Split } from "@/domain/types";

export interface IcsExportOptions {
  dtstamp: string;
  leadMinutes?: number;
  appUrl?: string;
}

function assertUtcIso(value: string, label: string): void {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new RangeError(`Invalid UTC ISO ${label}: ${value}`);
  }
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function formatIcsUtc(value: string): string {
  assertUtcIso(value, "timestamp");
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const segments: string[] = [];
  let segment = "";
  let segmentBytes = 0;
  let first = true;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    const allowance = first ? 75 : 74;
    if (segmentBytes + characterBytes > allowance) {
      segments.push(segment);
      segment = " " + character;
      segmentBytes = 1 + characterBytes;
      first = false;
      continue;
    }
    segment += character;
    segmentBytes += characterBytes;
  }

  if (segment) {
    segments.push(segment);
  }
  return segments.join("\r\n");
}

function splitAmount(splits: readonly Split[]): Paise {
  const amount = splits.reduce(
    (total, split) => total + BigInt(split.amount),
    0n,
  );
  if (
    amount > BigInt(Number.MAX_SAFE_INTEGER) ||
    amount < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError("Schedule amount exceeds the safe integer range");
  }
  return Number(amount) as Paise;
}

function recurrenceRule(schedule: ScheduledTransaction): string[] {
  const recurrence = schedule.recurrence;
  if (recurrence.type === "once") {
    return [];
  }

  const frequency =
    recurrence.unit === "day"
      ? "DAILY"
      : recurrence.unit === "week"
        ? "WEEKLY"
        : recurrence.unit === "month"
          ? "MONTHLY"
          : "YEARLY";
  const parts = [`FREQ=${frequency}`, `INTERVAL=${recurrence.n}`];
  if (schedule.maxEntries !== undefined) {
    parts.push(`COUNT=${schedule.maxEntries}`);
  } else if (schedule.endAt) {
    parts.push(`UNTIL=${formatIcsUtc(schedule.endAt)}`);
  }
  return [`RRULE:${parts.join(";")}`];
}

function emiAmount(schedule: ScheduledTransaction): Paise {
  if (!schedule.emi) {
    return splitAmount(schedule.template.splits);
  }
  return Number(
    BigInt(schedule.emi.principal) +
      BigInt(schedule.emi.interest) +
      BigInt(schedule.emi.tax),
  ) as Paise;
}

function emiDescription(schedule: ScheduledTransaction): string {
  if (!schedule.emi) {
    return schedule.template.note;
  }
  const principal = formatInr(schedule.emi.principal, "none");
  const interest = formatInr(schedule.emi.interest, "none");
  const tax = formatInr(schedule.emi.tax, "none");
  return `Principal: ${principal}\\nInterest: ${interest}\\nTax: ${tax}`;
}

function eventLines(
  schedule: ScheduledTransaction,
  options: IcsExportOptions,
): string[] {
  assertUtcIso(options.dtstamp, "DTSTAMP timestamp");
  assertUtcIso(schedule.startAt, "schedule start timestamp");
  if (schedule.endAt) {
    assertUtcIso(schedule.endAt, "schedule end timestamp");
  }

  const leadMinutes = options.leadMinutes ?? 1440;
  if (!Number.isSafeInteger(leadMinutes) || leadMinutes < 0) {
    throw new RangeError("Reminder lead time must be a non-negative integer");
  }

  const amount = emiAmount(schedule);
  const amountText = formatInr(amount, "none");
  const occurrenceIndex =
    schedule.scheduleType === "emi" && schedule.emi
      ? `-${schedule.emi.index + 1}`
      : "";
  const uid = `${schedule.id}${occurrenceIndex}@localedger`;
  const description = emiDescription(schedule);
  const appDescription = options.appUrl
    ? `${description}\\n${options.appUrl}`
    : description;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(options.dtstamp)}`,
    `DTSTART:${formatIcsUtc(schedule.startAt)}`,
    ...recurrenceRule(schedule),
    `SUMMARY:${escapeIcsText(`Pay: ${schedule.template.title} (${amountText})`)}`,
    `DESCRIPTION:${escapeIcsText(appDescription.replaceAll("\\n", "\n"))}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:-PT${leadMinutes}M`,
    `DESCRIPTION:${escapeIcsText(`Pay: ${schedule.template.title} (${amountText})`)}`,
    "END:VALARM",
    "END:VEVENT",
  ];
}

export function buildIcsCalendar(
  schedules: readonly ScheduledTransaction[],
  options: IcsExportOptions,
): string {
  const eventLinesForSchedules = schedules
    .filter((schedule) => !schedule.deleted)
    .flatMap((schedule) => eventLines(schedule, options));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Localedger//EN",
    "CALSCALE:GREGORIAN",
    ...eventLinesForSchedules,
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
