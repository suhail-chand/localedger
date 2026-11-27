# Localedger: Copilot instructions

Localedger is an open-source, single-user, local-first personal finance tracker (a Bluecoins-style app). It is a standalone React SPA hosted on GitHub Pages with **no backend**. Data lives in the browser (IndexedDB) and can optionally sync to the user's own Google Drive (`appDataFolder`).

**Priorities, in order:** 1) data integrity, retention and safety, 2) fast low-friction transaction entry, 3) clear overview of accounts and spending.

Always read these before non-trivial work. Do not re-derive what they already decide:
- `docs/requirements.md`: the full product spec (source of truth for behavior)
- `docs/data-model.md`: entity shapes, ID and timestamp rules, Drive file layout
- `docs/architecture.md`: stack, folder structure, layering rules
- `docs/milestones.md`: build order and the current milestone
- `docs/decisions.md`: assumptions and decisions made so far (append to it)

## Tech stack (do not substitute without asking)
Vite, React 18, TypeScript (strict), React Router (`HashRouter`), Dexie (IndexedDB), Zod (validation), date-fns, Tailwind CSS, lucide-react (icons), Vitest + React Testing Library + fake-indexeddb, ESLint + Prettier, vite-plugin-pwa. Package manager: npm. Do not add dependencies without stating why and checking that a small in-house function would not do.

## Non-negotiable rules
1. **Money is integer paise.** Never use floats for money anywhere (state, storage, math, tests). Convert to/from display strings only at the UI edge, via `src/domain/money.ts`. Display always has exactly 2 decimals, an INR symbol, and a sign (`+` credit, `-` debit, none for transfers), e.g. `+₹1,234.50`, with Indian digit grouping.
2. **Never use `eval`, `new Function`, or similar** for the amount calculator. Use the hand-written parser in `src/domain/calculator.ts`.
3. **Time:** store UTC ISO 8601 strings, display and enter local time. Use date-fns. Never store local-time strings.
4. **Records:** every record has `id` (UUID), `createdAt`, `updatedAt`, `deleted` (soft-delete tombstone). Never hard-delete synced records except in the explicit "purge trash" action.
5. **Derived, not stored:** account balances, transaction totals and dashboard aggregates are computed from transactions. Do not persist them.
6. **Validate** with Zod at every boundary: IndexedDB reads, backup restore, Drive file reads, form submission. Reject invalid data. Never silently "fix" it.
7. **Local first:** every edit is saved to IndexedDB immediately. Sync failures, offline periods and expired tokens must never block or lose local data.
8. **Never overwrite data without a recoverable copy.** Before replacing local or remote data (first sync, restore, migration, corruption recovery), snapshot it first.
9. **Single Drive scope:** only `https://www.googleapis.com/auth/drive.appdata`. No client secret anywhere. Access tokens live in memory only. The Client ID is entered by the user and stored on-device only, never synced.
10. **No analytics, no telemetry, no network calls** except Google APIs when Drive sync is enabled.
11. **Currency is INR only** for now, but keep a `currency` field in the data model so conversion can be added later.
12. **Out of scope** (do not build or stub): any import (including Bluecoins), budgeting, multi-user/sharing, multi-currency conversion, Google Calendar API, bank sync, SMS parsing, any backend, client-side encryption. Restoring the app's own JSON backup is allowed.

## Layering
`domain` (pure TS: types, schemas, money, calculator, balances, EMI, recurrence, merge) → `data` (Dexie, repositories, migrations, backup) → `sync` (Drive client, auth, sync engine) → `features` (React UI). Lower layers must never import from higher layers. `domain` must not import React, Dexie, or browser APIs.

## How to work
- **Plan first for anything touching more than 2 files:** state the plan, list the files you will change, then implement. For large features use the `/plan-feature` prompt.
- **Work in small, complete vertical slices.** Each slice must compile, pass lint and tests, and leave the app working.
- **Write tests with the code** for all `domain` and `data` logic. Cover edge cases: rounding, zero, negatives, leap years, month-end dates, DST, tombstones, concurrent edits.
- Before declaring done, run `npm run typecheck && npm run lint && npm run test`. Fix failures instead of reporting them.
- **Do not invent requirements.** If the spec is silent or ambiguous, state the assumption, choose the simplest safe option, and append it to `docs/decisions.md`.
- Do not refactor unrelated code, rename things, or reformat files you are not otherwise changing.
- Keep files small and focused (aim under about 300 lines). Prefer named exports. No `any` (use `unknown` and narrow).
- Comments explain **why**, not what. Remove dead code and unused imports.

## UI conventions
Mobile-first, one-handed use, touch targets of at least 44px, accessible (labels, focus, keyboard, aria), light and dark themes. Every destructive action needs confirmation or undo. Show clear empty, loading and error states. Forms show inline validation messages.

## When unsure about Google, Copilot or library APIs
Check the official docs rather than guessing, and say when something should be verified.
