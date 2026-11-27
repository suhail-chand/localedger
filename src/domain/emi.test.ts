import { describe, expect, it } from "vitest";

import {
  calculateEmi,
  validateEditableEmiBreakdown,
  type EmiInput,
} from "@/domain/emi";
import { sumPaise, toPaise } from "@/domain/money";

function flatInput(overrides: Partial<EmiInput> = {}): EmiInput {
  return {
    principal: toPaise(1_000_000),
    annualInterestRateBps: 1_200,
    taxRateBps: 0,
    tenure: 12,
    interestType: "flat",
    ...overrides,
  };
}

describe("EMI calculation", () => {
  it("keeps an exact flat principal total", () => {
    const plan = calculateEmi(
      flatInput({ principal: toPaise(100_001), tenure: 3 }),
    );

    expect(plan.principalTotal).toBe(100_001);
    expect(plan.instalments.map((row) => row.principal)).toEqual([
      33_334, 33_334, 33_333,
    ]);
  });

  it("returns zero interest and tax for a zero-interest flat loan", () => {
    const plan = calculateEmi(
      flatInput({
        principal: toPaise(12_000),
        annualInterestRateBps: 0,
        taxRateBps: 5_000,
        tenure: 12,
      }),
    );

    expect(plan.interestTotal).toBe(0);
    expect(plan.taxTotal).toBe(0);
  });

  it("calculates a one-month loan exactly", () => {
    const plan = calculateEmi(
      flatInput({
        principal: toPaise(123_456),
        annualInterestRateBps: 18_000,
        taxRateBps: 1_800,
        tenure: 1,
        interestType: "reducing",
      }),
    );

    expect(plan.instalments).toHaveLength(1);
    expect(plan.principalTotal).toBe(123_456);
    expect(plan.instalments[0]?.principal).toBe(123_456);
  });

  it("supports a 360-month reducing-balance loan", () => {
    const plan = calculateEmi(
      flatInput({
        principal: toPaise(10_000_000_000),
        annualInterestRateBps: 8_500,
        taxRateBps: 1_800,
        tenure: 360,
        interestType: "reducing",
      }),
    );

    expect(plan.instalments).toHaveLength(360);
    expect(plan.principalTotal).toBe(10_000_000_000);
    expect(plan.instalments[359]?.principal).toBeGreaterThan(0);
  });

  it("adjusts the final flat instalment for paise rounding", () => {
    const plan = calculateEmi(
      flatInput({ principal: toPaise(10_001), tenure: 3 }),
    );

    expect(plan.instalments[0]?.principal).toBe(3_334);
    expect(plan.instalments[1]?.principal).toBe(3_334);
    expect(plan.instalments[2]?.principal).toBe(3_333);
    expect(plan.paymentTotal).toBe(
      sumPaise(plan.instalments.map((row) => row.total)),
    );
  });

  it("calculates tax per instalment from the interest using basis points", () => {
    const plan = calculateEmi(
      flatInput({
        principal: toPaise(100_000),
        annualInterestRateBps: 12_000,
        taxRateBps: 1_800,
        tenure: 2,
      }),
    );

    expect(plan.instalments[0]?.interest).toBe(10_000);
    expect(plan.instalments[0]?.tax).toBe(1_800);
  });

  it("rejects invalid EMI inputs", () => {
    expect(() => calculateEmi(flatInput({ principal: toPaise(0) }))).toThrow(
      RangeError,
    );
    expect(() => calculateEmi(flatInput({ tenure: 0 }))).toThrow(RangeError);
    expect(() =>
      calculateEmi(flatInput({ annualInterestRateBps: -1 })),
    ).toThrow(RangeError);
  });

  it("warns about editable breakdown mismatches", () => {
    const input = flatInput({ principal: toPaise(100_000), tenure: 2 });
    const expected = calculateEmi(input);
    const edited = expected.instalments.map((row, index) =>
      index === 0 ? { ...row, principal: toPaise(row.principal + 1) } : row,
    );

    const validation = validateEditableEmiBreakdown(edited, input, expected);

    expect(validation.valid).toBe(false);
    expect(validation.mismatchWarnings).toContain(
      "Principal breakdown totals 100001 paise; expected 100000 paise.",
    );
  });

  it("accepts an internally consistent matching breakdown", () => {
    const input = flatInput({ principal: toPaise(100_000), tenure: 2 });
    const expected = calculateEmi(input);

    const validation = validateEditableEmiBreakdown(
      expected.instalments,
      input,
      expected,
    );

    expect(validation.valid).toBe(true);
    expect(validation.mismatchWarnings).toEqual([]);
  });
});
