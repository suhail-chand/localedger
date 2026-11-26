import type { Paise } from "@/domain/types";
import { MAX_PAISE } from "@/domain/constants";

export { MAX_PAISE } from "@/domain/constants";

export type MoneySignMode = "always" | "negative" | "none";

export function toPaise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Paise must be a safe integer");
  }
  if (Math.abs(value) > MAX_PAISE) {
    throw new RangeError("Paise exceeds the application maximum");
  }
  return value as Paise;
}

export function sumPaise(values: readonly Paise[]): Paise {
  const total = values.reduce((sum, value) => sum + BigInt(toPaise(value)), 0n);
  if (
    total > BigInt(Number.MAX_SAFE_INTEGER) ||
    total < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError("Paise total exceeds the safe integer range");
  }
  return toPaise(Number(total));
}

export function rupeesToPaise(value: string | number): Paise {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError("Amount must be a finite number");
    }
    if (/e/i.test(value.toString())) {
      throw new RangeError("Numeric rupee amount must use decimal notation");
    }
    return roundRupeesToPaise(value);
  }

  const normalized = value.trim().replace(/^([+-]?)₹/, "$1");
  const unsignedForGrouping =
    normalized.replace(/^[+-]/, "").split(".")[0] ?? "";
  if (
    unsignedForGrouping.includes(",") &&
    !/^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})$/.test(
      unsignedForGrouping,
    )
  ) {
    throw new RangeError("Invalid rupee amount");
  }
  const commaFree = normalized.replace(/,/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(commaFree)) {
    throw new RangeError("Invalid rupee amount");
  }

  const sign = commaFree.startsWith("-") ? -1n : 1n;
  const unsigned = commaFree.replace(/^[+-]/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  if (fraction.length > 6) {
    throw new RangeError("Rupee amount has too much precision");
  }

  const scaledFraction = BigInt((fraction || "").padEnd(6, "0"));
  const numerator =
    BigInt(whole || "0") * 100n * 1_000_000n + scaledFraction * 100n;
  const paise = roundHalfAway(numerator, 1_000_000n) * sign;
  if (!Number.isSafeInteger(Number(paise))) {
    throw new RangeError("Paise value exceeds the safe integer range");
  }
  return toPaise(Number(paise));
}

export function paiseFromRupees(value: string | number): Paise {
  return rupeesToPaise(value);
}

export function paiseToRupeesString(value: Paise): string {
  toPaise(value);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole}.${fraction.toString().padStart(2, "0")}`;
}

export function formatPaise(
  value: Paise,
  signMode: MoneySignMode = "always",
): string {
  toPaise(value);

  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100).toString();
  const fraction = (absolute % 100).toString().padStart(2, "0");
  const grouped = formatIndianInteger(whole);

  if (signMode === "none") {
    return `₹${grouped}.${fraction}`;
  }
  if (value < 0) {
    return `-₹${grouped}.${fraction}`;
  }
  if (signMode === "always" && value > 0) {
    return `+₹${grouped}.${fraction}`;
  }
  return `₹${grouped}.${fraction}`;
}

export function formatInr(
  value: Paise,
  signMode: MoneySignMode = "always",
): string {
  return formatPaise(value, signMode);
}

export function formatCurrency(
  value: Paise,
  signMode: MoneySignMode = "always",
): string {
  return formatPaise(value, signMode);
}

export function formatPaiseInr(
  value: Paise,
  signMode: MoneySignMode = "always",
): string {
  return formatPaise(value, signMode);
}

function formatIndianInteger(value: string): string {
  if (value.length <= 3) {
    return value;
  }
  const lastThree = value.slice(-3);
  const leading = value.slice(0, -3);
  const groupedLeading = leading.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${groupedLeading},${lastThree}`;
}

function roundRupeesToPaise(value: number): Paise {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const text = absolute.toString();
  const [wholeText, fractionText = ""] = text.split(".");
  const whole = BigInt(wholeText || "0");
  const fraction = fractionText.padEnd(6, "0").slice(0, 6);
  const numerator = whole * 100n * 1_000_000n + BigInt(fraction) * 100n;
  const paise = roundHalfAway(numerator, 1_000_000n) * BigInt(sign);
  if (!Number.isSafeInteger(Number(paise))) {
    throw new RangeError("Paise value exceeds the safe integer range");
  }
  return toPaise(Number(paise));
}

function roundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("Cannot round with a non-positive denominator");
  }
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const doubled = remainder * 2n;
  return sign * (quotient + (doubled >= denominator ? 1n : 0n));
}
