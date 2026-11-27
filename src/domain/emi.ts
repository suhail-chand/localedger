import type { Paise } from "@/domain/types";
import { sumPaise, toPaise } from "@/domain/money";

export type EmiInterestType = "flat" | "reducing";

export interface EmiInput {
  principal: Paise;
  annualInterestRateBps: number;
  taxRateBps: number;
  tenure: number;
  interestType: EmiInterestType;
}

export interface EmiInstalment {
  index: number;
  principal: Paise;
  interest: Paise;
  tax: Paise;
  total: Paise;
}

export interface EmiPlan {
  instalments: EmiInstalment[];
  principalTotal: Paise;
  interestTotal: Paise;
  taxTotal: Paise;
  paymentTotal: Paise;
}

export interface EmiBreakdownValidation {
  valid: boolean;
  mismatchWarnings: string[];
}

const PERCENT_BPS_DENOMINATOR = 10_000n;
const ANNUAL_RATE_DENOMINATOR = 120_000n;

function validateInput(input: EmiInput): void {
  toPaise(input.principal);
  if (input.principal <= 0) {
    throw new RangeError("EMI principal must be greater than zero");
  }
  if (
    !Number.isSafeInteger(input.annualInterestRateBps) ||
    input.annualInterestRateBps < 0
  ) {
    throw new RangeError(
      "Annual interest rate must be a non-negative integer basis-point value",
    );
  }
  if (!Number.isSafeInteger(input.taxRateBps) || input.taxRateBps < 0) {
    throw new RangeError(
      "Tax rate must be a non-negative integer basis-point value",
    );
  }
  if (!Number.isInteger(input.tenure) || input.tenure < 1) {
    throw new RangeError("EMI tenure must be a positive integer");
  }
}

function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("Cannot round with a non-positive denominator");
  }
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

function calculateTax(interest: Paise, taxRateBps: number): Paise {
  const tax = roundRatio(
    BigInt(interest) * BigInt(taxRateBps),
    PERCENT_BPS_DENOMINATOR,
  );
  return toPaise(Number(tax));
}

function createInstalment(
  index: number,
  principal: Paise,
  interest: Paise,
  taxRateBps: number,
): EmiInstalment {
  const tax = calculateTax(interest, taxRateBps);
  return {
    index,
    principal,
    interest,
    tax,
    total: sumPaise([principal, interest, tax]),
  };
}

function calculateFlatPlan(input: EmiInput): EmiPlan {
  const instalments: EmiInstalment[] = [];
  const basePrincipal = Number(
    roundRatio(BigInt(input.principal), BigInt(input.tenure)),
  );
  let remainingPrincipal = input.principal;
  const monthlyInterest = toPaise(
    Number(
      roundRatio(
        BigInt(input.principal) * BigInt(input.annualInterestRateBps),
        ANNUAL_RATE_DENOMINATOR,
      ),
    ),
  );

  for (let index = 0; index < input.tenure; index += 1) {
    const principal =
      index === input.tenure - 1
        ? remainingPrincipal
        : toPaise(Math.min(basePrincipal, remainingPrincipal));
    remainingPrincipal = toPaise(remainingPrincipal - principal);
    instalments.push(
      createInstalment(index, principal, monthlyInterest, input.taxRateBps),
    );
  }

  const principalTotal = sumPaise(instalments.map((row) => row.principal));
  const interestTotal = sumPaise(instalments.map((row) => row.interest));
  const taxTotal = sumPaise(instalments.map((row) => row.tax));
  const paymentTotal = sumPaise(instalments.map((row) => row.total));
  return {
    instalments,
    principalTotal,
    interestTotal,
    taxTotal,
    paymentTotal,
  };
}

function calculateReducingMonthlyPayment(input: EmiInput): Paise {
  if (input.annualInterestRateBps === 0) {
    return toPaise(
      Number(roundRatio(BigInt(input.principal), BigInt(input.tenure))),
    );
  }

  const base = 120_000n + BigInt(input.annualInterestRateBps);
  const power = base ** BigInt(input.tenure);
  const denominatorPower = ANNUAL_RATE_DENOMINATOR ** BigInt(input.tenure);
  const numerator =
    BigInt(input.principal) * BigInt(input.annualInterestRateBps) * power;
  const denominator = ANNUAL_RATE_DENOMINATOR * (power - denominatorPower);

  return toPaise(Number(roundRatio(numerator, denominator)));
}

function calculateReducingPlan(input: EmiInput): EmiPlan {
  const instalments: EmiInstalment[] = [];
  let openingBalance = input.principal;
  const monthlyPayment = calculateReducingMonthlyPayment(input);

  for (let index = 0; index < input.tenure; index += 1) {
    const interest = toPaise(
      Number(
        roundRatio(
          BigInt(openingBalance) * BigInt(input.annualInterestRateBps),
          ANNUAL_RATE_DENOMINATOR,
        ),
      ),
    );
    let principal: Paise;
    if (index === input.tenure - 1) {
      principal = openingBalance;
    } else {
      const scheduledPrincipal = toPaise(monthlyPayment - interest);
      principal =
        scheduledPrincipal > openingBalance
          ? openingBalance
          : scheduledPrincipal;
      if (principal < 0) {
        principal = toPaise(0);
      }
    }
    openingBalance = toPaise(openingBalance - principal);
    instalments.push(
      createInstalment(index, principal, interest, input.taxRateBps),
    );
  }

  const principalTotal = sumPaise(instalments.map((row) => row.principal));
  const interestTotal = sumPaise(instalments.map((row) => row.interest));
  const taxTotal = sumPaise(instalments.map((row) => row.tax));
  const paymentTotal = sumPaise(instalments.map((row) => row.total));
  return {
    instalments,
    principalTotal,
    interestTotal,
    taxTotal,
    paymentTotal,
  };
}

export function calculateEmi(input: EmiInput): EmiPlan {
  validateInput(input);
  if (input.interestType === "flat") {
    return calculateFlatPlan(input);
  }
  if (input.interestType === "reducing") {
    return calculateReducingPlan(input);
  }
  throw new RangeError("Unsupported EMI interest type");
}

export function validateEditableEmiBreakdown(
  breakdown: readonly EmiInstalment[],
  input: EmiInput,
  expectedPlan?: EmiPlan,
): EmiBreakdownValidation {
  validateInput(input);
  const mismatchWarnings: string[] = [];

  if (breakdown.length !== input.tenure) {
    mismatchWarnings.push(
      `Breakdown has ${breakdown.length} instalments; expected ${input.tenure}.`,
    );
  }

  const principalTotal = sumPaise(
    breakdown.map((row) => toPaise(row.principal)),
  );
  if (principalTotal !== input.principal) {
    mismatchWarnings.push(
      `Principal breakdown totals ${principalTotal} paise; expected ${input.principal} paise.`,
    );
  }

  for (const row of breakdown) {
    if (
      !Number.isSafeInteger(row.principal) ||
      !Number.isSafeInteger(row.interest) ||
      !Number.isSafeInteger(row.tax) ||
      row.principal < 0 ||
      row.interest < 0 ||
      row.tax < 0
    ) {
      mismatchWarnings.push(
        `Instalment ${row.index + 1} contains an invalid negative or non-integer value.`,
      );
    }
    const computedTotal = sumPaise([
      toPaise(row.principal),
      toPaise(row.interest),
      toPaise(row.tax),
    ]);
    if (row.total !== computedTotal) {
      mismatchWarnings.push(
        `Instalment ${row.index + 1} total does not equal principal plus interest plus tax.`,
      );
    }
  }

  if (expectedPlan) {
    for (let index = 0; index < breakdown.length; index += 1) {
      const actual = breakdown[index];
      const expected = expectedPlan.instalments[index];
      if (!actual || !expected) {
        break;
      }
      if (
        actual.principal !== expected.principal ||
        actual.interest !== expected.interest ||
        actual.tax !== expected.tax
      ) {
        mismatchWarnings.push(
          `Instalment ${index + 1} differs from the calculated breakdown.`,
        );
      }
    }
  }

  return {
    valid: mismatchWarnings.length === 0,
    mismatchWarnings,
  };
}
