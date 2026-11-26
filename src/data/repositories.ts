import type { Table } from 'dexie';
import type { z } from 'zod';

import { db, type LocaledgerDatabase } from '@/data/db';
import { toUtcIso } from '@/domain/ids';
import {
  accountSchema,
  categoryGroupSchema,
  categorySchema,
  labelSchema,
  occurrenceRecordSchema,
  payeeGroupSchema,
  payeeSchema,
  scheduledTransactionSchema,
  settingsSchema,
  transactionSchema,
} from '@/domain/schemas';
import type {
  Account,
  Category,
  CategoryGroup,
  Label,
  OccurrenceRecord,
  Payee,
  PayeeGroup,
  ScheduledTransaction,
  Settings,
  Transaction,
} from '@/domain/types';

type BaseFields = 'id' | 'createdAt' | 'updatedAt' | 'deleted' | 'deviceId';
type NewRecord<T> = Omit<T, BaseFields>;
type RecordChanges<T> = Partial<NewRecord<T>>;

export interface RepositoryOptions {
  now?: () => Date;
  idFactory?: () => string;
}

export interface Repository<T extends { id: string }> {
  create(input: NewRecord<T>): Promise<T>;
  get(id: string): Promise<T | undefined>;
  list(includeDeleted?: boolean): Promise<T[]>;
  update(id: string, changes: RecordChanges<T>): Promise<T>;
  softDelete(id: string): Promise<T>;
  restore(id: string): Promise<T>;
  purge(id: string): Promise<boolean>;
}

function defaultIdFactory(): string {
  return globalThis.crypto.randomUUID();
}

export function createRepository<
  T extends { id: string; createdAt: string; updatedAt: string; deleted: boolean },
>(
  table: Table<T, string>,
  schema: z.ZodType<T>,
  options: RepositoryOptions = {},
): Repository<T> {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;

  function timestamp(): string {
    return toUtcIso(now());
  }

  async function get(id: string): Promise<T | undefined> {
    const record = await table.get(id);
    return record ? schema.parse(record) : undefined;
  }

  return {
    async create(input: NewRecord<T>): Promise<T> {
      const timestampValue = timestamp();
      const record = schema.parse({
        ...input,
        id: idFactory(),
        createdAt: timestampValue,
        updatedAt: timestampValue,
        deleted: false,
      });
      await table.put(record);
      return record;
    },

    get,

    async list(includeDeleted = false): Promise<T[]> {
      const records = includeDeleted
        ? await table.toArray()
        : (await table.filter((record) => !record.deleted).toArray());
      return records.map((record) => schema.parse(record));
    },

    async update(id: string, changes: RecordChanges<T>): Promise<T> {
      const existing = await get(id);
      if (!existing) {
        throw new Error(`Record ${id} does not exist`);
      }
      const updated = schema.parse({
        ...existing,
        ...changes,
        id,
        updatedAt: timestamp(),
      });
      await table.put(updated);
      return updated;
    },

    async softDelete(id: string): Promise<T> {
      const existing = await get(id);
      if (!existing) {
        throw new Error(`Record ${id} does not exist`);
      }
      const deleted = schema.parse({
        ...existing,
        deleted: true,
        updatedAt: timestamp(),
      });
      await table.put(deleted);
      return deleted;
    },

    async restore(id: string): Promise<T> {
      const existing = await get(id);
      if (!existing) {
        throw new Error(`Record ${id} does not exist`);
      }
      const restored = schema.parse({
        ...existing,
        deleted: false,
        updatedAt: timestamp(),
      });
      await table.put(restored);
      return restored;
    },

    async purge(id: string): Promise<boolean> {
      const existing = await get(id);
      if (!existing) {
        return false;
      }
      if (!existing.deleted) {
        throw new Error(`Record ${id} must be in trash before permanent purge`);
      }
      await table.delete(id);
      return true;
    },
  };
}

export function createAccountRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Account> {
  const repository = createRepository(database.accounts, accountSchema, options);
  return {
    ...repository,
    async softDelete(id: string): Promise<Account> {
      const transaction = await database.transactions
        .filter((record) => !record.deleted)
        .filter((record) =>
          record.splits.some(
            (split) =>
              (split.type === 'expense' || split.type === 'income'
                ? split.accountId === id
                : split.fromAccountId === id || split.toAccountId === id),
          ),
        )
        .first();
      if (transaction) {
        throw new Error('Accounts with transactions can only be hidden or archived');
      }
      return repository.softDelete(id);
    },
  };
}

export function createCategoryGroupRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<CategoryGroup> {
  return createRepository(database.categoryGroups, categoryGroupSchema, options);
}

export function createCategoryRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Category> {
  const repository = createRepository(database.categories, categorySchema, options);
  return {
    ...repository,
    async softDelete(id: string): Promise<Category> {
      const category = await repository.get(id);
      if (category?.builtIn) {
        throw new Error('Built-in categories cannot be deleted');
      }
      return repository.softDelete(id);
    },
  };
}

export function createPayeeGroupRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<PayeeGroup> {
  return createRepository(database.payeeGroups, payeeGroupSchema, options);
}

export function createPayeeRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Payee> {
  const repository = createRepository(database.payees, payeeSchema, options);
  return {
    ...repository,
    async softDelete(id: string): Promise<Payee> {
      const payee = await repository.get(id);
      if (payee?.builtIn) {
        throw new Error('Built-in payees cannot be deleted');
      }
      return repository.softDelete(id);
    },
  };
}

export function createLabelRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Label> {
  const repository = createRepository(database.labels, labelSchema, options);
  return {
    ...repository,
    async softDelete(id: string): Promise<Label> {
      const timestamp = toUtcIso(options.now?.() ?? new Date());
      await database.transaction(
        'rw',
        [database.labels, database.transactions],
        async () => {
          const label = await repository.get(id);
          if (!label) {
            throw new Error(`Record ${id} does not exist`);
          }
          await repository.softDelete(id);
          const transactions = await database.transactions.toArray();
          for (const transaction of transactions) {
            if (!transaction.labelIds.includes(id)) {
              continue;
            }
            await database.transactions.put(
              transactionSchema.parse({
                ...transaction,
                labelIds: transaction.labelIds.filter((labelId) => labelId !== id),
                updatedAt: timestamp,
              }),
            );
          }
        },
      );
      const deleted = await repository.get(id);
      if (!deleted) {
        throw new Error(`Record ${id} does not exist`);
      }
      return deleted;
    },
  };
}

export function createTransactionRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Transaction> {
  return createRepository(database.transactions, transactionSchema, options);
}

export function createScheduleRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<ScheduledTransaction> {
  return createRepository(
    database.scheduledTransactions,
    scheduledTransactionSchema,
    options,
  );
}

export function createOccurrenceRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<OccurrenceRecord> {
  return createRepository(
    database.occurrenceRecords,
    occurrenceRecordSchema,
    options,
  );
}

export function createSettingsRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Settings> {
  return createRepository(database.settings, settingsSchema, options);
}

export const repositories = {
  accounts: createAccountRepository(db),
  categoryGroups: createCategoryGroupRepository(db),
  categories: createCategoryRepository(db),
  payeeGroups: createPayeeGroupRepository(db),
  payees: createPayeeRepository(db),
  labels: createLabelRepository(db),
  transactions: createTransactionRepository(db),
  schedules: createScheduleRepository(db),
  occurrences: createOccurrenceRepository(db),
  settings: createSettingsRepository(db),
};
