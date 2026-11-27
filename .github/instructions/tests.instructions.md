---
description: Testing conventions
applyTo: "**/*.test.{ts,tsx}"
---
- Vitest. Arrange-Act-Assert. One behaviour per test, with descriptive names ("rounds half away from zero to 2 decimals").
- Use builders in `src/test/` (e.g. `buildTransaction({ ... })`) rather than inline giant objects. Inject fixed clocks and IDs.
- Money assertions compare integer paise. Never use `toBeCloseTo` for money.
- Test unhappy paths and edge cases: zero and negative amounts, rounding, month-end and leap-day recurrence, DST transitions, empty states, tombstones, duplicate IDs, invalid or corrupt input.
- IndexedDB tests use `fake-indexeddb`. Do not mock Dexie itself.
- Do not weaken or delete a failing test to make it pass. Fix the code, or explain why the test is wrong.
