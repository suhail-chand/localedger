import { describe, expect, it } from "vitest";

import {
  MAX_PAISE,
  formatInr,
  formatPaise,
  paiseFromRupees,
  paiseToRupeesString,
  rupeesToPaise,
  sumPaise,
  toPaise,
} from "@/domain/money";

describe("integer paise money helpers", () => {
  it("creates paise only from safe integers", () => {
    expect(toPaise(0)).toBe(0);
    expect(() => toPaise(12.5)).toThrow(RangeError);
    expect(() => toPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("enforces the application paise boundary", () => {
    expect(MAX_PAISE).toBe(10_000_000_000_000);
    expect(() => toPaise(MAX_PAISE)).not.toThrow();
    expect(() => toPaise(MAX_PAISE + 1)).toThrow(RangeError);
  });

  it("sums paise exactly and rejects totals outside the safe integer range", () => {
    expect(sumPaise([toPaise(25), toPaise(-10), toPaise(5)])).toBe(20);
    expect(() =>
      sumPaise(Array.from({ length: 901 }, () => toPaise(MAX_PAISE))),
    ).toThrow(RangeError);
  });

  it("converts rupee strings exactly to paise", () => {
    expect(rupeesToPaise("1,234.50")).toBe(123450);
    expect(rupeesToPaise("₹12.05")).toBe(1205);
    expect(rupeesToPaise("-0.01")).toBe(-1);
    expect(paiseFromRupees(".5")).toBe(50);
  });

  it("rejects invalid rupee strings", () => {
    expect(() => rupeesToPaise("")).toThrow(RangeError);
    expect(() => rupeesToPaise("12abc")).toThrow(RangeError);
    expect(() => rupeesToPaise("Infinity")).toThrow(RangeError);
  });

  it("rejects malformed comma-separated rupee amounts", () => {
    expect(() => rupeesToPaise("12,")).toThrow(RangeError);
    expect(() => rupeesToPaise("1,,234.50")).toThrow(RangeError);
    expect(() => rupeesToPaise("₹12₹")).toThrow(RangeError);
  });

  it("rejects invalid numeric rupee inputs", () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => rupeesToPaise("1e3")).toThrow(RangeError);
    expect(() => rupeesToPaise(1e21)).toThrow(RangeError);
    expect(() => rupeesToPaise(1e-7)).toThrow(RangeError);
  });

  it("rounds extra rupee decimals half away from zero", () => {
    expect(rupeesToPaise("1.005")).toBe(101);
    expect(rupeesToPaise("-1.005")).toBe(-101);
  });

  it("formats with Indian grouping and explicit signs", () => {
    expect(formatPaise(toPaise(123450))).toBe("+₹1,234.50");
    expect(formatInr(toPaise(-123450))).toBe("-₹1,234.50");
    expect(formatPaise(toPaise(123450), "none")).toBe("₹1,234.50");
    expect(formatPaise(toPaise(0))).toBe("₹0.00");
  });

  it("converts paise back to rupee display strings", () => {
    expect(paiseToRupeesString(toPaise(123450))).toBe("1234.50");
    expect(paiseToRupeesString(toPaise(-1))).toBe("-0.01");
  });

  it("rejects paise outside the application boundary at formatting edges", () => {
    expect(() => formatPaise(toPaise(MAX_PAISE))).not.toThrow();
    expect(() =>
      formatPaise((MAX_PAISE + 1) as Parameters<typeof formatPaise>[0]),
    ).toThrow(RangeError);
  });
});
