---
name: ics-export
description: Generate iCalendar (.ics) reminder files for Localedger scheduled transactions and deliver them via the Web Share API or download. Use for reminder export features.
---

# ICS reminder export

No Google Calendar API. The app generates a standards-compliant `.ics` file client-side and hands it to the OS (share sheet or download).

## Generation (`src/domain/ics.ts`, pure and tested)

- RFC 5545: `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Localedger//EN`, `CALSCALE:GREGORIAN`, one `VEVENT` per schedule (or per instalment for EMI), `END:VCALENDAR`. Lines end with CRLF. **Fold lines longer than 75 octets.** Escape `\`, `;`, `,` and newlines in text values.
- Stable `UID`: `<scheduleId>[-<occurrenceIndex>]@localedger` so re-importing updates instead of duplicating (behaviour varies by calendar app, so do not promise it).
- `DTSTAMP` and `DTSTART` in UTC (`YYYYMMDDTHHMMSSZ`).
- Recurrence: map the rule to `RRULE` (`FREQ=DAILY|WEEKLY|MONTHLY|YEARLY;INTERVAL=n`) with `COUNT` or `UNTIL` from the end condition. Month-end: for rules that start on day 29-31, use `BYMONTHDAY=-1` only if the app's rule is "last day"; otherwise note the limitation in the UI. One-time schedules have no `RRULE`.
- EMI: export one event per instalment (amounts differ). Put principal, interest and tax in the `DESCRIPTION`.
- `VALARM`: `ACTION:DISPLAY`, `TRIGGER:-PT<lead>` (default 1 day before, configurable), `DESCRIPTION` with title and amount.
- `SUMMARY`: "Pay: <title> (₹amount)". Never include account balances or notes in the file.

## Delivery

Try `navigator.canShare({ files })` then `navigator.share({ files: [file] })` with `type: 'text/calendar'`. Fall back to a Blob download link (`.ics`). Handle `AbortError` (user cancelled) silently.

## UI copy to include

"Reminders are a one-time export. If you change a schedule, export again." and "Some calendar apps (e.g. Google Calendar) may ignore the reminder time in the file and use your default notification settings."

## Tests

Folding and escaping, UTC conversion, `RRULE` for each unit with `COUNT`/`UNTIL`, month-end start dates, stable UID, EMI event count, CRLF endings, and a snapshot of a full calendar.
