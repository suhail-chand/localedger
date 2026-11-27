import { z } from "zod";

export const uuidSchema = z.string().uuid();

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export function createUuidV4(randomValues: readonly number[]): string {
  if (randomValues.length !== 16) {
    throw new RangeError("UUID v4 requires exactly 16 random byte values");
  }

  const bytes = randomValues.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(
        "UUID random byte values must be integers from 0 to 255",
      );
    }
    return value;
  });

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export const utcIsoSchema = z.string().refine(isUtcIsoString, {
  message: "Must be a UTC ISO 8601 timestamp",
});

export function isUtcIsoString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function toUtcIso(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Cannot convert an invalid Date to UTC ISO");
  }
  return date.toISOString();
}

function hash32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createDeterministicUuid(input: string): string {
  if (input.length === 0) {
    throw new RangeError("Deterministic UUID input cannot be empty");
  }

  const sections = [
    hash32(input, 0x811c9dc5),
    hash32(input, 0x9e3779b9),
    hash32(input, 0x85ebca6b),
    hash32(input, 0xc2b2ae35),
  ].map((part) => part.toString(16).padStart(8, "0"));

  const bytes = sections.join("");
  const variant = (Number.parseInt(bytes.slice(16, 18), 16) & 0x3f) | 0x80;
  const versioned = (Number.parseInt(bytes.slice(12, 14), 16) & 0x0f) | 0x50;
  const hex =
    bytes.slice(0, 12) +
    versioned.toString(16).padStart(2, "0") +
    bytes.slice(14, 16) +
    variant.toString(16).padStart(2, "0") +
    bytes.slice(18);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function createScheduledTransactionId(
  scheduleId: string,
  occurrenceAt: string,
): string {
  return createDeterministicUuid(`transaction:${scheduleId}:${occurrenceAt}`);
}

export function createOccurrenceRecordId(
  scheduleId: string,
  occurrenceAt: string,
): string {
  return createDeterministicUuid(`occurrence:${scheduleId}:${occurrenceAt}`);
}

export function createOccurrenceId(
  scheduleId: string,
  occurrenceAt: string,
): string {
  return createOccurrenceRecordId(scheduleId, occurrenceAt);
}
