import { z } from 'zod';

import { utcIsoSchema, uuidSchema } from '@/domain/ids';

export const paiseSchema = z
  .number()
  .int()
  .transform((value) => value as number & { readonly __brand: 'Paise' });

export const accountTypeSchema = z.enum([
  'cash',
  'savings',
  'credit_card',
  'loan',
  'liability',
  'payable',
  'receivable',
  'investment',
  'other',
]);

export const baseRecordSchema = z
  .object({
    id: uuidSchema,
    createdAt: utcIsoSchema,
    updatedAt: utcIsoSchema,
    deleted: z.boolean(),
    deviceId: z.string().min(1).optional(),
  })
  .strict();

export const accountSchema = baseRecordSchema
  .extend({
    name: z.string().trim().min(1),
    type: accountTypeSchema,
    openingDate: utcIsoSchema,
    startingBalance: paiseSchema,
    currency: z.literal('INR'),
    note: z.string(),
    hideFromTransactions: z.boolean(),
    hideFromReports: z.boolean(),
  })
  .strict();

export const categoryGroupSchema = baseRecordSchema
  .extend({
    name: z.string().trim().min(1),
    kind: z.enum(['expense', 'income']),
  })
  .strict();

export const categorySchema = baseRecordSchema
  .extend({
    name: z.string().trim().min(1),
    icon: z.string().min(1),
    groupId: uuidSchema,
    kind: z.enum(['expense', 'income']),
    builtIn: z.boolean().optional(),
  })
  .strict();

export const payeeGroupSchema = baseRecordSchema
  .extend({
    name: z.string().trim().min(1),
  })
  .strict();

export const payeeSchema = baseRecordSchema
  .extend({
    name: z.string().trim().min(1),
    groupId: uuidSchema.optional(),
    builtIn: z.boolean().optional(),
  })
  .strict();

export const labelSchema = baseRecordSchema
  .extend({
    name: z.string().trim().min(1),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  })
  .strict();

const splitBaseSchema = z
  .object({
    id: uuidSchema,
    amount: paiseSchema.refine((value) => value > 0, 'Amount must be greater than zero'),
    note: z.string(),
  })
  .strict();

export const expenseSplitSchema = splitBaseSchema
  .extend({
    type: z.literal('expense'),
    accountId: uuidSchema,
    categoryId: uuidSchema.optional(),
    payeeId: uuidSchema.optional(),
  })
  .strict();

export const incomeSplitSchema = splitBaseSchema
  .extend({
    type: z.literal('income'),
    accountId: uuidSchema,
    categoryId: uuidSchema.optional(),
    payeeId: uuidSchema.optional(),
  })
  .strict();

export const transferSplitSchema = splitBaseSchema
  .extend({
    type: z.literal('transfer'),
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
  })
  .strict()
  .refine(
    (split) => split.fromAccountId !== split.toAccountId,
    'Transfer from and to accounts must differ',
  );

export const splitSchema = z.discriminatedUnion('type', [
  expenseSplitSchema,
  incomeSplitSchema,
  transferSplitSchema,
]);

export const transactionSchema = baseRecordSchema
  .extend({
    title: z.string().trim().min(1),
    occurredAt: utcIsoSchema,
    currency: z.literal('INR'),
    splits: z.array(splitSchema).min(1),
    labelIds: z.array(uuidSchema),
    status: z.enum(['uncleared', 'cleared', 'reconciled']),
    note: z.string(),
    scheduleId: uuidSchema.optional(),
    occurrenceAt: utcIsoSchema.optional(),
  })
  .strict();

export const recurrenceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('once'),
    })
    .strict(),
  z
    .object({
      type: z.literal('every'),
      n: z.number().int().positive(),
      unit: z.enum(['day', 'week', 'month', 'year']),
    })
    .strict(),
]);

export const scheduledTransactionSchema = baseRecordSchema
  .extend({
    scheduleType: z.enum(['one_time', 'recurring', 'emi']),
    template: z
      .object({
        title: z.string().trim().min(1),
        occurredAt: utcIsoSchema,
        currency: z.literal('INR'),
        splits: z.array(splitSchema).min(1),
        labelIds: z.array(uuidSchema),
        status: z.enum(['uncleared', 'cleared', 'reconciled']),
        note: z.string(),
      })
      .strict(),
    recurrence: recurrenceSchema,
    startAt: utcIsoSchema,
    endAt: utcIsoSchema.optional(),
    maxEntries: z.number().int().positive().optional(),
    autoRecord: z.boolean(),
    status: z.enum(['active', 'paused', 'completed']),
    lastEvaluatedAt: utcIsoSchema.optional(),
    seriesId: uuidSchema.optional(),
    emi: z
      .object({
        index: z.number().int().nonnegative(),
        principal: paiseSchema,
        interest: paiseSchema,
        tax: paiseSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

export const occurrenceRecordSchema = baseRecordSchema
  .extend({
    scheduleId: uuidSchema,
    occurrenceAt: utcIsoSchema,
    outcome: z.enum(['recorded', 'skipped']),
    transactionId: uuidSchema.optional(),
  })
  .strict();

export const settingsSchema = baseRecordSchema
  .extend({
    theme: z.enum(['light', 'dark', 'system']),
    reminderLeadMinutes: z.number().int().nonnegative(),
    backupsToKeep: z.number().int().positive(),
  })
  .strict();
