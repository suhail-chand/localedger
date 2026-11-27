---
name: money-and-calculator
description: Implement or modify money handling in Localedger, including integer-paise math, INR display formatting, signed amounts, and the safe amount calculator for split inputs. Use for any code that parses, formats, adds, or rounds amounts.
---
# Money and calculator

## Rules
- Money is an integer number of **paise** (1 INR = 100 paise). Use a branded type `Paise = number & { __brand: 'Paise' }` and constructors that assert `Number.isSafeInteger`.
- Never store, add or compare rupee floats. Parse user text to paise once, at the input edge.
- Rounding: round half away from zero to 2 decimal places when converting a decimal result to paise. Document it in code.
- Display: `+₹1,234.50` / `-₹1,234.50` / `₹1,234.50`. Indian grouping (`en-IN`: 12,34,567.00). Always exactly 2 decimals. Sign rule: `+` for income/credit, `-` for expense/debit, none for transfers.

## Module API (`src/domain/money.ts`)
- `toPaise(rupees: string | number): Paise` (parses "1,234.5" and returns 123450; rejects NaN/Infinity)
- `fromPaise(p: Paise): string` (plain "1234.50")
- `formatInr(p: Paise, opts?: { sign?: 'auto' | 'always' | 'never' }): string`
- `sumPaise(values: Paise[]): Paise`
- `splitEvenly(total: Paise, parts: number): Paise[]` (distributes the remainder paise so the parts sum exactly to the total)

## Calculator (`src/domain/calculator.ts`)
A hand-written tokenizer and recursive-descent parser. **Never `eval`.**
- Supports `+ - * / ( )`, unary minus, decimals, optional thousands commas, `×` and `÷` as aliases for `*` and `/`, and whitespace.
- Returns `{ ok: true, paise } | { ok: false, error }`. Division by zero, empty input, unbalanced parentheses, and results that are not finite are errors with human-readable messages.
- The final result is rounded to exactly 2 decimals (half away from zero) and converted to paise. Intermediate values may use JS numbers, but compute the final value carefully (e.g. scale inputs, or use a decimal-safe approach) and test classic float traps: `0.1 + 0.2`, `1.005 * 100`, `19.99 * 3`.
- Amounts for a split must be greater than zero. The calculator returns negative results as errors for split entry.

## Tests that must exist
`0.1+0.2 → 0.30`, `1.005 → 1.01` (half away from zero, check input as string), `10/3 → 3.33`, `2*(3+4) → 14.00`, `-5` rejected for splits, `1/0` error, `1,234.5+1` → 1235.50, very large values rejected, no `eval` usage (lint rule `no-eval`).

## UI (`MoneyInput`)
Text input with `inputmode="decimal"`, shows the expression as typed, evaluates on blur/enter, displays the rounded result, and shows an inline error for invalid expressions. Never silently changes what the user typed until they commit.
