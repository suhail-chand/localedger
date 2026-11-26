import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export function createUuidV4(randomValues: readonly number[]): string {
  if (randomValues.length !== 16) {
    throw new RangeError('UUID v4 requires exactly 16 random byte values');
  }

  const bytes = randomValues.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError('UUID random byte values must be integers from 0 to 255');
    }
    return value;
  });

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export const utcIsoSchema = z.string().refine(isUtcIsoString, {
  message: 'Must be a UTC ISO 8601 timestamp',
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
    throw new RangeError('Cannot convert an invalid Date to UTC ISO');
  }
  return date.toISOString();
}
