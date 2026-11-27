---
description: Rules for the pure domain layer (money, calculator, balances, EMI, recurrence, merge)
applyTo: "src/domain/**"
---
- Pure TypeScript only: no React, no Dexie, no `window`, `localStorage` or `fetch`. Functions must be deterministic. Pass the clock and IDs in as parameters (e.g. `now: Date`) so tests are stable.
- Money is a `number` holding **integer paise** (use a `Paise` branded type). Assert integers at module boundaries. Round only where the spec says to, using round-half-away-from-zero, and document it.
- Every exported function has unit tests beside it in `*.test.ts`. Include edge cases and invariant checks (e.g. EMI breakdown sums to exactly the principal, a transaction's total equals the sum of its splits).
- No hidden global state. No `Date.now()` or `Math.random()` inside logic.
- Prefer small composable functions and discriminated unions (`type: 'expense' | 'income' | 'transfer'`) with exhaustive `switch` handling (`assertNever`).
