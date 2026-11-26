import type { z } from "zod";

import type {
  accountTypeSchema,
  accountSchema,
  categoryGroupSchema,
  categorySchema,
  labelSchema,
  occurrenceRecordSchema,
  payeeGroupSchema,
  payeeSchema,
  scheduledTransactionSchema,
  settingsSchema,
  splitSchema,
  transactionSchema,
} from "@/domain/schemas";

export type Paise = number & { readonly __brand: "Paise" };
export type AccountType = z.infer<typeof accountTypeSchema>;
export type Account = z.infer<typeof accountSchema>;
export type CategoryGroup = z.infer<typeof categoryGroupSchema>;
export type Category = z.infer<typeof categorySchema>;
export type PayeeGroup = z.infer<typeof payeeGroupSchema>;
export type Payee = z.infer<typeof payeeSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Split = z.infer<typeof splitSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type ScheduledTransaction = z.infer<typeof scheduledTransactionSchema>;
export type OccurrenceRecord = z.infer<typeof occurrenceRecordSchema>;
export type Settings = z.infer<typeof settingsSchema>;
