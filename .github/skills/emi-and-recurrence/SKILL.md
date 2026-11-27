---
name: emi-and-recurrence
description: Implement scheduled transactions in Localedger, covering recurrence generation, due-date catch-up, idempotent auto-recording, and EMI (loan instalment) breakdown calculations with editable review. Use for schedules, EMI, due/overdue logic.
---
# Scheduled transactions, recurrence and EMI

## Recurrence (`src/domain/recurrence.ts`)
- Rule: `{ type: 'once' | 'every', n, unit: 'day' | 'week' | 'month' | 'year', start: UTC ISO, endDate?: UTC ISO, maxEntries?: number }`.
- Generate occurrences from the rule as a pure function: `occurrences(rule, { from, to })`. Compute each occurrence from the **start date and index** (`start + i*n units`), never by repeatedly adding to the previous result, so month-end dates do not drift (Jan 31 → Feb 28/29 → Mar 31).
- Month-end rule: if the target month lacks the day, use the last day of that month. Document and test this (Jan 31, Feb 29 leap years, Dec to Jan).
- Occurrences are evaluated in the user's **local timezone** for "which day is it", but stored as UTC. Test across DST changes and around midnight.
- Stop at `endDate` or `maxEntries`, whichever comes first.

## Catch-up and auto-record
- There is no background processing. On app open and on foreground, compute occurrences due since the schedule's `lastEvaluatedAt` (or start) up to now.
- Auto-record flag on: create the transaction from the schedule template at the occurrence's due time. Off: mark the occurrence **Due/Overdue** and let the user record, edit-then-record, or skip it.
- **Idempotency is mandatory** because several devices may evaluate the same schedule. The created transaction ID must be deterministic: derive a UUID (v5-style hash) from `scheduleId + occurrence due date (UTC ISO)`. Creating it twice must yield the same record. Skipped occurrences are stored as a record too, with a deterministic ID, so another device does not recreate them.
- Pausing, ending or editing: editing offers "future occurrences only" (default) vs "all". Past recorded transactions are never rewritten.

## EMI (`src/domain/emi.ts`)
Inputs: principal (paise), annual interest % , interest type (`reducing` | `flat`), tax % on interest (optional), tenure in months, start date, `loanPaymentAccountId`, `loanAccountId`.
- **Reducing balance:** monthly rate r = annual/12/100. Instalment E = P·r·(1+r)^n / ((1+r)^n − 1) (if r = 0, E = P/n). Each month: interest = round(outstanding·r), principal = E − interest. The **final instalment** absorbs rounding so total principal repaid equals the principal exactly and outstanding ends at 0.
- **Flat:** total interest = P·rate·years; interest and principal are spread evenly with remainder distributed so sums are exact.
- **Tax** = round(interest · taxPercent/100) per instalment, shown separately (it is paid on top of the instalment).
- All arithmetic on paise with explicit rounding (half away from zero). Test: sum(principal parts) == principal, 0% interest, 1-month tenure, large tenure (360), rounding in the last instalment.
- Output a breakdown row per instalment: `{ index, dueDate, principal, interest, tax, outstandingAfter }`.
- **Review step:** every figure is user-editable before approval. If edited principal parts no longer sum to the principal, show a clear warning with the difference (do not block, but require confirmation).
- On approval create one scheduled entry per instalment, linked by a `seriesId`, each with **3 splits**: (1) Transfer principal from Loan Payment Account to Loan Account, (2) Expense for interest, (3) Expense for tax (omit if zero). Interest and tax use the auto-created categories "Interest" and "Tax".
