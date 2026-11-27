import type { Table } from "dexie";
import type { z } from "zod";

import { db, type LocaledgerDatabase } from "@/data/db";
import { SEED_IDS } from "@/data/seed";
import {
  deleteCategoryAndReassign,
  deletePayeeAndReassign,
} from "@/data/trash";
import { toUtcIso } from "@/domain/ids";
import { scanTransactions } from "@/data/transactionScan";
import {
  assertAccountNotInUse,
  assertCategoryGroupAvailable,
  assertOccurrenceReferencesAvailable,
  assertPayeeGroupAvailable,
  assertScheduleReferencesAvailable,
  assertTransactionReferencesAvailable,
  AccountUsageCorruptionError,
  TransactionAccountUnavailableError,
} from "@/data/referenceIntegrity";

export { AccountUsageCorruptionError, TransactionAccountUnavailableError };
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
} from "@/domain/schemas";
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
} from "@/domain/types";

type BaseFields = "id" | "createdAt" | "updatedAt" | "deleted" | "deviceId";
type NewRecord<T> = Omit<T, BaseFields>;
type RecordChanges<T> = Partial<NewRecord<T>>;

export interface RepositoryOptions {
  now?: () => Date;
  idFactory?: () => string;
}

export class AccountInUseError extends Error {
  constructor() {
    super("Account is in use; hide or archive it instead");
    this.name = "AccountInUseError";
  }
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
  T extends {
    id: string;
    createdAt: string;
    updatedAt: string;
    deleted: boolean;
  },
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
        : await table.filter((record) => !record.deleted).toArray();
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
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: timestamp(),
        deleted: existing.deleted,
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
  const repository = createRepository(
    database.accounts,
    accountSchema,
    options,
  );
  return {
    ...repository,
    async softDelete(id: string): Promise<Account> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.transactions,
          database.scheduledTransactions,
        ],
        async () => {
          const inUse = await assertAccountNotInUse(database, id);
          if (inUse) {
            throw new AccountInUseError();
          }
          return repository.softDelete(id);
        },
      );
    },
    async purge(id: string): Promise<boolean> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.transactions,
          database.scheduledTransactions,
        ],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            return false;
          }
          if (!existing.deleted) {
            throw new Error(
              `Record ${id} must be in trash before permanent purge`,
            );
          }
          if (await assertAccountNotInUse(database, id)) {
            throw new AccountInUseError();
          }
          await database.accounts.delete(id);
          return true;
        },
      );
    },
  };
}

export function createCategoryGroupRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<CategoryGroup> {
  const repository = createRepository(
    database.categoryGroups,
    categoryGroupSchema,
    options,
  );
  return {
    ...repository,
    async update(
      id: string,
      changes: RecordChanges<CategoryGroup>,
    ): Promise<CategoryGroup> {
      return database.transaction(
        "rw",
        [database.categoryGroups, database.categories],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          if (
            id === SEED_IDS.expenseOtherGroup ||
            id === SEED_IDS.incomeOtherGroup
          ) {
            throw new Error("Built-in Other category groups cannot be edited");
          }
          const updated = categoryGroupSchema.parse({
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
            deleted: existing.deleted,
          });
          if (updated.kind !== existing.kind) {
            const mismatched = await database.categories
              .filter((category) => category.groupId === id)
              .filter((category) => category.kind !== updated.kind)
              .count();
            if (mismatched > 0) {
              throw new Error(
                "Category group kind cannot differ from its categories",
              );
            }
          }
          await database.categoryGroups.put(updated);
          return updated;
        },
      );
    },
    async softDelete(id: string): Promise<CategoryGroup> {
      return database.transaction(
        "rw",
        [database.categoryGroups, database.categories],
        async () => {
          const categoryGroup = await database.categoryGroups.get(id);
          if (!categoryGroup) {
            throw new Error(`Record ${id} does not exist`);
          }
          if (
            id === SEED_IDS.expenseOtherGroup ||
            id === SEED_IDS.incomeOtherGroup
          ) {
            throw new Error("Built-in Other category groups cannot be deleted");
          }
          const inUse = await database.categories
            .filter((category) => !category.deleted && category.groupId === id)
            .count();
          if (inUse > 0) {
            throw new Error(
              "Category group is in use; move or delete its categories first",
            );
          }
          return repository.softDelete(id);
        },
      );
    },
    async purge(id: string): Promise<boolean> {
      return database.transaction(
        "rw",
        [database.categoryGroups, database.categories],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            return false;
          }
          if (!existing.deleted) {
            throw new Error(
              `Record ${id} must be in trash before permanent purge`,
            );
          }
          if (
            id === SEED_IDS.expenseOtherGroup ||
            id === SEED_IDS.incomeOtherGroup
          ) {
            throw new Error("Built-in Other category groups cannot be purged");
          }
          const inUse = await database.categories
            .filter((category) => category.groupId === id)
            .count();
          if (inUse > 0) {
            throw new Error(
              "Category group is still referenced; purge its categories first",
            );
          }
          await database.categoryGroups.delete(id);
          return true;
        },
      );
    },
  };
}

export function createCategoryRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Category> {
  const repository = createRepository(
    database.categories,
    categorySchema,
    options,
  );
  return {
    ...repository,
    async create(input): Promise<Category> {
      return database.transaction(
        "rw",
        [database.categoryGroups, database.categories],
        async () => {
          await assertCategoryGroupAvailable(
            database,
            input.groupId,
            input.kind,
          );
          return repository.create(input);
        },
      );
    },
    async update(id: string, changes): Promise<Category> {
      return database.transaction(
        "rw",
        [database.categoryGroups, database.categories],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          if (existing.builtIn) {
            throw new Error("Built-in categories cannot be edited");
          }
          const updated = categorySchema.parse({
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
            deleted: existing.deleted,
          });
          await assertCategoryGroupAvailable(
            database,
            updated.groupId,
            updated.kind,
          );
          await database.categories.put(updated);
          return updated;
        },
      );
    },
    async restore(id: string): Promise<Category> {
      return database.transaction(
        "rw",
        [database.categoryGroups, database.categories],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          await assertCategoryGroupAvailable(database, existing.groupId);
          return repository.restore(id);
        },
      );
    },
    async purge(id: string): Promise<boolean> {
      const existing = await repository.get(id);
      if (existing?.builtIn) {
        throw new Error("Built-in categories cannot be purged");
      }
      return repository.purge(id);
    },
    async softDelete(id: string): Promise<Category> {
      const category = await repository.get(id);
      if (category?.builtIn) {
        throw new Error("Built-in categories cannot be deleted");
      }
      await deleteCategoryAndReassign(
        database,
        id,
        category?.kind === "income" ? SEED_IDS.incomeOther : SEED_IDS.other,
        options.now?.() ?? new Date(),
      );
      const deleted = await repository.get(id);
      if (!deleted) {
        throw new Error(`Record ${id} does not exist`);
      }
      return deleted;
    },
  };
}

export function createPayeeGroupRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<PayeeGroup> {
  const repository = createRepository(
    database.payeeGroups,
    payeeGroupSchema,
    options,
  );
  return {
    ...repository,
    async softDelete(id: string): Promise<PayeeGroup> {
      return database.transaction(
        "rw",
        [database.payeeGroups, database.payees],
        async () => {
          const payeeGroup = await database.payeeGroups.get(id);
          if (!payeeGroup) {
            throw new Error(`Record ${id} does not exist`);
          }
          const inUse = await database.payees
            .filter((payee) => !payee.deleted && payee.groupId === id)
            .count();
          if (inUse > 0) {
            throw new Error(
              "Payee group is in use; move or delete its payees first",
            );
          }
          return repository.softDelete(id);
        },
      );
    },
    async purge(id: string): Promise<boolean> {
      return database.transaction(
        "rw",
        [database.payeeGroups, database.payees],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            return false;
          }
          if (!existing.deleted) {
            throw new Error(
              `Record ${id} must be in trash before permanent purge`,
            );
          }
          const inUse = await database.payees
            .filter((payee) => payee.groupId === id)
            .count();
          if (inUse > 0) {
            throw new Error(
              "Payee group is still referenced; purge its payees first",
            );
          }
          await database.payeeGroups.delete(id);
          return true;
        },
      );
    },
  };
}

export function createPayeeRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<Payee> {
  const repository = createRepository(database.payees, payeeSchema, options);
  return {
    ...repository,
    async create(input): Promise<Payee> {
      return database.transaction(
        "rw",
        [database.payeeGroups, database.payees],
        async () => {
          await assertPayeeGroupAvailable(database, input.groupId);
          return repository.create(input);
        },
      );
    },
    async update(id: string, changes): Promise<Payee> {
      return database.transaction(
        "rw",
        [database.payeeGroups, database.payees],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          if (existing.builtIn) {
            throw new Error("Built-in payees cannot be edited");
          }
          const updated = payeeSchema.parse({
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
            deleted: existing.deleted,
          });
          await assertPayeeGroupAvailable(database, updated.groupId);
          await database.payees.put(updated);
          return updated;
        },
      );
    },
    async restore(id: string): Promise<Payee> {
      return database.transaction(
        "rw",
        [database.payeeGroups, database.payees],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          await assertPayeeGroupAvailable(database, existing.groupId);
          return repository.restore(id);
        },
      );
    },
    async softDelete(id: string): Promise<Payee> {
      const payee = await repository.get(id);
      if (payee?.builtIn) {
        throw new Error("Built-in payees cannot be deleted");
      }
      await deletePayeeAndReassign(
        database,
        id,
        SEED_IDS.unspecified,
        options.now?.() ?? new Date(),
      );
      const deleted = await repository.get(id);
      if (!deleted) {
        throw new Error(`Record ${id} does not exist`);
      }
      return deleted;
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
        "rw",
        [
          database.labels,
          database.transactions,
          database.scheduledTransactions,
        ],
        async () => {
          const label = await repository.get(id);
          if (!label) {
            throw new Error(`Record ${id} does not exist`);
          }
          await repository.softDelete(id);
          await scanTransactions(database, async (transaction) => {
            if (!transaction.labelIds.includes(id)) {
              return;
            }
            await database.transactions.put(
              transactionSchema.parse({
                ...transaction,
                labelIds: transaction.labelIds.filter(
                  (labelId) => labelId !== id,
                ),
                updatedAt: timestamp,
              }),
            );
          });
          const schedules = await database.scheduledTransactions.toArray();
          for (const record of schedules) {
            const schedule = scheduledTransactionSchema.parse(record);
            if (!schedule.template.labelIds.includes(id)) {
              continue;
            }
            await database.scheduledTransactions.put(
              scheduledTransactionSchema.parse({
                ...schedule,
                template: {
                  ...schedule.template,
                  labelIds: schedule.template.labelIds.filter(
                    (labelId) => labelId !== id,
                  ),
                },
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
  const repository = createRepository(
    database.transactions,
    transactionSchema,
    options,
  );

  return {
    ...repository,
    async create(input): Promise<Transaction> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.categories,
          database.payees,
          database.labels,
          database.transactions,
        ],
        async () => {
          const timestamp = toUtcIso(options.now?.() ?? new Date());
          const transaction = transactionSchema.parse({
            ...input,
            id: options.idFactory?.() ?? defaultIdFactory(),
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: false,
          });
          await assertTransactionReferencesAvailable(database, transaction);
          await database.transactions.put(transaction);
          return transaction;
        },
      );
    },
    async update(id, changes): Promise<Transaction> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.categories,
          database.payees,
          database.labels,
          database.transactions,
        ],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          const updated = transactionSchema.parse({
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
            deleted: existing.deleted,
          });
          await assertTransactionReferencesAvailable(database, updated);
          await database.transactions.put(updated);
          return updated;
        },
      );
    },
    async restore(id): Promise<Transaction> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.categories,
          database.payees,
          database.labels,
          database.transactions,
        ],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          const restored = transactionSchema.parse({
            ...existing,
            deleted: false,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
          });
          await assertTransactionReferencesAvailable(database, restored);
          await database.transactions.put(restored);
          return restored;
        },
      );
    },
    async purge(id: string): Promise<boolean> {
      return database.transaction(
        "rw",
        [database.transactions, database.occurrenceRecords],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            return false;
          }
          if (!existing.deleted) {
            throw new Error(
              `Record ${id} must be in trash before permanent purge`,
            );
          }
          const timestamp = toUtcIso(options.now?.() ?? new Date());
          const occurrences = await database.occurrenceRecords
            .filter((record) => record.transactionId === id)
            .toArray();
          for (const record of occurrences) {
            const occurrence = occurrenceRecordSchema.parse(record);
            await database.occurrenceRecords.put(
              occurrenceRecordSchema.parse({
                ...occurrence,
                transactionId: undefined,
                updatedAt: timestamp,
              }),
            );
          }
          await database.transactions.delete(id);
          return true;
        },
      );
    },
  };
}

export function createScheduleRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<ScheduledTransaction> {
  const repository = createRepository(
    database.scheduledTransactions,
    scheduledTransactionSchema,
    options,
  );
  return {
    ...repository,
    async create(input): Promise<ScheduledTransaction> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.categories,
          database.payees,
          database.labels,
          database.scheduledTransactions,
        ],
        async () => {
          const timestamp = toUtcIso(options.now?.() ?? new Date());
          const schedule = scheduledTransactionSchema.parse({
            ...input,
            id: options.idFactory?.() ?? defaultIdFactory(),
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: false,
          });
          await assertScheduleReferencesAvailable(database, schedule);
          await database.scheduledTransactions.put(schedule);
          return schedule;
        },
      );
    },
    async update(
      id: string,
      changes: Partial<
        Omit<ScheduledTransaction, "id" | "createdAt" | "updatedAt" | "deleted">
      >,
    ): Promise<ScheduledTransaction> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.categories,
          database.payees,
          database.labels,
          database.scheduledTransactions,
        ],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          const updated = scheduledTransactionSchema.parse({
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
            deleted: existing.deleted,
          });
          await assertScheduleReferencesAvailable(database, updated);
          await database.scheduledTransactions.put(updated);
          return updated;
        },
      );
    },
    async restore(id: string): Promise<ScheduledTransaction> {
      return database.transaction(
        "rw",
        [
          database.accounts,
          database.categories,
          database.payees,
          database.labels,
          database.scheduledTransactions,
        ],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          const restored = scheduledTransactionSchema.parse({
            ...existing,
            deleted: false,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
          });
          await assertScheduleReferencesAvailable(database, restored);
          await database.scheduledTransactions.put(restored);
          return restored;
        },
      );
    },
    async purge(id: string): Promise<boolean> {
      return database.transaction(
        "rw",
        [database.scheduledTransactions, database.occurrenceRecords],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            return false;
          }
          if (!existing.deleted) {
            throw new Error(
              `Record ${id} must be in trash before permanent purge`,
            );
          }
          await database.occurrenceRecords
            .filter((record) => record.scheduleId === id)
            .delete();
          await database.scheduledTransactions.delete(id);
          return true;
        },
      );
    },
  };
}

export function createOccurrenceRepository(
  database: LocaledgerDatabase,
  options: RepositoryOptions = {},
): Repository<OccurrenceRecord> {
  const repository = createRepository(
    database.occurrenceRecords,
    occurrenceRecordSchema,
    options,
  );
  return {
    ...repository,
    async create(input): Promise<OccurrenceRecord> {
      return database.transaction(
        "rw",
        [
          database.occurrenceRecords,
          database.scheduledTransactions,
          database.transactions,
        ],
        async () => {
          const timestamp = toUtcIso(options.now?.() ?? new Date());
          const occurrence = occurrenceRecordSchema.parse({
            ...input,
            id: options.idFactory?.() ?? defaultIdFactory(),
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: false,
          });
          await assertOccurrenceReferencesAvailable(database, occurrence);
          await database.occurrenceRecords.put(occurrence);
          return occurrence;
        },
      );
    },
    async update(
      id: string,
      changes: Partial<
        Omit<OccurrenceRecord, "id" | "createdAt" | "updatedAt" | "deleted">
      >,
    ): Promise<OccurrenceRecord> {
      return database.transaction(
        "rw",
        [
          database.occurrenceRecords,
          database.scheduledTransactions,
          database.transactions,
        ],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          const updated = occurrenceRecordSchema.parse({
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
            deleted: existing.deleted,
          });
          await assertOccurrenceReferencesAvailable(database, updated);
          await database.occurrenceRecords.put(updated);
          return updated;
        },
      );
    },
    async restore(id: string): Promise<OccurrenceRecord> {
      return database.transaction(
        "rw",
        [
          database.occurrenceRecords,
          database.scheduledTransactions,
          database.transactions,
        ],
        async () => {
          const existing = await repository.get(id);
          if (!existing) {
            throw new Error(`Record ${id} does not exist`);
          }
          const restored = occurrenceRecordSchema.parse({
            ...existing,
            deleted: false,
            updatedAt: toUtcIso(options.now?.() ?? new Date()),
          });
          await assertOccurrenceReferencesAvailable(database, restored);
          await database.occurrenceRecords.put(restored);
          return restored;
        },
      );
    },
  };
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

export {
  endSchedule,
  evaluateSchedules,
  pauseSchedule,
  recordScheduleOccurrence,
  skipScheduleOccurrence,
  OccurrenceAlreadyRecordedError,
  OccurrenceAlreadySkippedError,
} from "@/data/scheduleEvaluation";
