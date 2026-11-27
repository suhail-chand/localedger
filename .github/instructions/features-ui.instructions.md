---
description: UI conventions for feature screens and components
applyTo: "src/features/**,src/components/**"
---

- Mobile-first layout, primary actions within thumb reach, touch targets of at least 44px, visible focus states, a label on every input, correct `inputmode` (`decimal` for amounts), semantic HTML.
- Tailwind utility classes plus a small set of shared components in `src/components/` (Button, Input, Select, Sheet/Modal, ConfirmDialog, EmptyState, Amount, MoneyInput, DateTimeInput, CategoryIcon). Reuse before creating new ones.
- Amounts are rendered only through the shared `<Amount />` component (currency symbol, sign, 2 decimals, Indian grouping; colour is never the only signal).
- Long lists (transactions) are paginated or virtualized, grouped by local date with a daily total.
- Forms: validate with the Zod schema, show inline errors, keep user input on failure, disable Save while submitting, prevent duplicate submits.
- Destructive actions use a ConfirmDialog or an Undo toast. Delete is soft.
- Every screen has empty, loading and error states. Avoid layout shift.
- Support light and dark themes via Tailwind `dark:` variants and CSS variables for the palette.
- Component tests (React Testing Library) for forms and list behaviour: query by role or label, not by class names.
