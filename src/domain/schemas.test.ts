import { describe, expect, it } from 'vitest';

import {
  accountSchema,
  expenseSplitSchema,
  incomeSplitSchema,
  paiseSchema,
  scheduledTransactionSchema,
  settingsSchema,
  transferSplitSchema,
  transactionSchema,
} from '@/domain/schemas';

const base = {
  id: '00010203-0405-4607-8809-0a0b0c0d0e0f',
  createdAt: '2026-11-26T16:58:42.348Z',
  updatedAt: '2026-11-26T16:58:42.348Z',
  deleted: false,
};

describe('core record schemas', () => {
  it('parses a valid account and rejects unknown fields', () => {
    const account = {
      ...base,
      name: 'Wallet',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: 125000,
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    };

    expect(accountSchema.parse(account)).toEqual(account);
    expect(accountSchema.safeParse({ ...account, unknown: true }).success).toBe(false);
  });

  it('rejects invalid paise and non-UTC timestamps', () => {
    expect(paiseSchema.safeParse(12.5).success).toBe(false);
    expect(
      accountSchema.safeParse({
        ...base,
        name: 'Wallet',
        type: 'cash',
        openingDate: '2026-11-26T00:00:00',
        startingBalance: 0,
        currency: 'INR',
        note: '',
        hideFromTransactions: false,
        hideFromReports: false,
      }).success,
    ).toBe(false);
  });

  it('preserves tombstones and optional device IDs', () => {
    const tombstone = { ...base, deleted: true, deviceId: 'device-a' };
    expect(accountSchema.parse({ ...tombstone, name: 'Old', type: 'cash', openingDate: base.createdAt, startingBalance: 0, currency: 'INR', note: '', hideFromTransactions: false, hideFromReports: false }).deleted).toBe(true);
  });
});

describe('split schemas', () => {
  const splitBase = {
    id: base.id,
    amount: 100,
    note: '',
  };

  it('parses expense and income splits', () => {
    expect(expenseSplitSchema.parse({ ...splitBase, type: 'expense', accountId: base.id })).toMatchObject({ type: 'expense' });
    expect(incomeSplitSchema.parse({ ...splitBase, type: 'income', accountId: base.id })).toMatchObject({ type: 'income' });
  });

  it('rejects zero amounts and equal transfer accounts', () => {
    expect(expenseSplitSchema.safeParse({ ...splitBase, amount: 0, type: 'expense', accountId: base.id }).success).toBe(false);
    expect(transferSplitSchema.safeParse({ ...splitBase, type: 'transfer', fromAccountId: base.id, toAccountId: base.id }).success).toBe(false);
  });

  it('rejects fields that do not belong to a split type', () => {
    expect(expenseSplitSchema.safeParse({ ...splitBase, type: 'expense', accountId: base.id, fromAccountId: base.id }).success).toBe(false);
  });
});

describe('transactions and schedules', () => {
  it('rejects transactions without splits', () => {
    expect(
      transactionSchema.safeParse({
        ...base,
        title: 'Empty',
        occurredAt: base.createdAt,
        currency: 'INR',
        splits: [],
        labelIds: [],
        status: 'cleared',
        note: '',
      }).success,
    ).toBe(false);
  });

  it('parses a valid transaction and schedule', () => {
    const split = { id: base.id, type: 'expense', amount: 100, accountId: base.id, note: '' };
    const transaction = {
      ...base,
      title: 'Groceries',
      occurredAt: base.createdAt,
      currency: 'INR',
      splits: [split],
      labelIds: [],
      status: 'cleared',
      note: '',
    };
    expect(transactionSchema.parse(transaction).title).toBe('Groceries');

    const schedule = {
      ...base,
      scheduleType: 'recurring',
      template: {
        title: 'Groceries',
        occurredAt: base.createdAt,
        currency: 'INR',
        splits: [split],
        labelIds: [],
        status: 'cleared',
        note: '',
      },
      recurrence: { type: 'every', n: 1, unit: 'month' },
      startAt: base.createdAt,
      autoRecord: true,
      status: 'active',
    };
    expect(scheduledTransactionSchema.parse(schedule).scheduleType).toBe('recurring');
  });
});

describe('settings', () => {
  it('validates settings and rejects negative or unknown values', () => {
    const settings = {
      ...base,
      theme: 'dark',
      reminderLeadMinutes: 30,
      backupsToKeep: 5,
    };
    expect(settingsSchema.parse(settings)).toEqual(settings);
    expect(settingsSchema.safeParse({ ...settings, reminderLeadMinutes: -1 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, extra: true }).success).toBe(false);
  });
});
