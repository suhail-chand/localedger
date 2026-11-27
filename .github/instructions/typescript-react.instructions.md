---
description: TypeScript and React conventions for all source files
applyTo: "src/**/*.{ts,tsx}"
---
- TypeScript strict mode. No `any`, no non-null assertions (`!`) without a comment explaining why it is safe, no `@ts-ignore` (use `@ts-expect-error` with a reason).
- Derive types from Zod schemas (`z.infer`) so types and runtime validation cannot drift.
- Function components and hooks only. Keep components small; extract logic into hooks (`useXxx`) and pure functions in `domain/`.
- Read data from Dexie via `dexie-react-hooks` (`useLiveQuery`) so the UI updates reactively. Write only through repository functions in `src/data/`; never call `db.table` from components.
- Never put business logic (totals, balances, merging, recurrence, EMI) inside components. Call `domain/` functions.
- Format money only through `src/domain/money.ts`. Do not format money ad hoc.
- Handle errors explicitly. Do not swallow exceptions. Surface user-facing errors with a clear message and keep the user's input.
- Import order: external, then `@/` aliases, then relative. Use the `@/` alias for `src/`.
- Naming: components `PascalCase.tsx`, hooks `useThing.ts`, domain modules `kebab-case.ts`, tests `*.test.ts(x)` beside the code.
