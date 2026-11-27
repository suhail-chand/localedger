import type { LocaledgerDatabase } from "@/data/db";
import { SEED_IDS } from "@/data/seed";
import { toUtcIso } from "@/domain/ids";
import {
  accountSchema,
  categoryGroupSchema,
  categorySchema,
  occurrenceRecordSchema,
  payeeSchema,
  scheduledTransactionSchema,
  transactionSchema,
} from "@/domain/schemas";
import { scanTransactions } from "@/data/transactionScan";
import {
  assertAccountNotInUse,
  assertCategoryKindAvailable,
} from "@/data/referenceIntegrity";
import type { Split } from "@/domain/types";

export class BuiltInFallbackError extends Error {
  constructor(kind: "category" | "payee") {
    super(`Built-in ${kind} fallback is missing or invalid`);
    this.name = "BuiltInFallbackError";
  }
}

export class DeletedAccountInUseError extends Error {
  constructor(accountId: string) {
    super(`Cannot purge account ${accountId}; it is still referenced`);
    this.name = "DeletedAccountInUseError";
  }
}

async function assertCategoryFallbackAvailable(
  database: LocaledgerDatabase,
  kind: "expense" | "income",
): Promise<string> {
  const fallbackId =
    kind === "expense" ? SEED_IDS.other : SEED_IDS.incomeOther;
  const groupId =
    kind === "expense"
      ? SEED_IDS.expenseOtherGroup
      : SEED_IDS.incomeOtherGroup;
  const fallback = categorySchema.safeParse(
    await database.categories.get(fallbackId),
  );
  const group = categoryGroupSchema.safeParse(
    await database.categoryGroups.get(groupId),
  );
  if (
    !fallback.success ||
    fallback.data.id !== fallbackId ||
    fallback.data.builtIn !== true ||
    fallback.data.deleted ||
    fallback.data.name !== "Other" ||
    fallback.data.kind !== kind ||
    fallback.data.groupId !== groupId ||
    !group.success ||
    group.data.deleted ||
    group.data.name !== "Other" ||
    group.data.kind !== kind
  ) {
    throw new BuiltInFallbackError("category");
  }
  return fallbackId;
}

function categoryFallbackId(kind: "expense" | "income"): string {
  return kind === "expense" ? SEED_IDS.other : SEED_IDS.incomeOther;
}

async function assertCategoryKindsAvailable(
  database: LocaledgerDatabase,
  splits: readonly Split[],
): Promise<void> {
  for (const split of splits) {
    if (
      (split.type === "expense" || split.type === "income") &&
      split.categoryId
    ) {
      await assertCategoryKindAvailable(database, split.categoryId, split.type);
    }
  }
}

async function assertPayeeFallbackAvailable(
  database: LocaledgerDatabase,
): Promise<void> {
  const fallback = payeeSchema.safeParse(
    await database.payees.get(SEED_IDS.unspecified),
  );
  if (
    !fallback.success ||
    fallback.data.id !== SEED_IDS.unspecified ||
    fallback.data.builtIn !== true ||
    fallback.data.deleted
  ) {
    throw new BuiltInFallbackError("payee");
  }
}

export async function deleteCategoryAndReassign(
  database: LocaledgerDatabase,
  categoryId: string,
  fallbackCategoryId: string,
  now = new Date(),
): Promise<void> {
  await database.transaction(
    "rw",
    [
      database.categories,
      database.categoryGroups,
      database.transactions,
      database.scheduledTransactions,
    ],
    async () => {
      const category = await database.categories.get(categoryId);
      if (!category) {
        throw new Error(`Category ${categoryId} does not exist`);
      }
      if (category.builtIn) {
        throw new Error("Built-in categories cannot be deleted");
      }

      const expectedFallbackId = categoryFallbackId(category.kind);
      if (fallbackCategoryId !== expectedFallbackId) {
        throw new BuiltInFallbackError("category");
      }
      await assertCategoryFallbackAvailable(database, category.kind);

      const timestamp = toUtcIso(now);
      const deletedCategory = categorySchema.parse({
        ...category,
        deleted: true,
        updatedAt: timestamp,
      });
      await database.categories.put(deletedCategory);
      await scanTransactions(database, async (transaction) => {
        let changed = false;
        const splits = transaction.splits.map((split) => {
          if (
            (split.type === "expense" || split.type === "income") &&
            split.categoryId === categoryId
          ) {
            changed = true;
            return { ...split, categoryId: fallbackCategoryId };
          }
          return split;
        });
        if (changed) {
          const updated = transactionSchema.parse({
            ...transaction,
            splits,
            updatedAt: timestamp,
          });
          await assertCategoryKindsAvailable(database, updated.splits);
          await database.transactions.put(updated);
        }
      });
      const schedules = await database.scheduledTransactions.toArray();
      for (const record of schedules) {
        const schedule = scheduledTransactionSchema.parse(record);
        let changed = false;
        const splits = schedule.template.splits.map((split) => {
          if (
            (split.type === "expense" || split.type === "income") &&
            split.categoryId === categoryId
          ) {
            changed = true;
            return { ...split, categoryId: fallbackCategoryId };
          }
          return split;
        });
        if (changed) {
          const updated = scheduledTransactionSchema.parse({
            ...schedule,
            template: { ...schedule.template, splits },
            updatedAt: timestamp,
          });
          await assertCategoryKindsAvailable(database, updated.template.splits);
          await database.scheduledTransactions.put(updated);
        }
      }
    },
  );
}

export async function deletePayeeAndReassign(
  database: LocaledgerDatabase,
  payeeId: string,
  fallbackPayeeId: string,
  now = new Date(),
): Promise<void> {
  await database.transaction(
    "rw",
    [database.payees, database.transactions, database.scheduledTransactions],
    async () => {
      const payee = await database.payees.get(payeeId);
      if (!payee) {
        throw new Error(`Payee ${payeeId} does not exist`);
      }
      if (payee.builtIn) {
        throw new Error("Built-in payees cannot be deleted");
      }

      if (fallbackPayeeId !== SEED_IDS.unspecified) {
        throw new BuiltInFallbackError("payee");
      }
      await assertPayeeFallbackAvailable(database);

      const timestamp = toUtcIso(now);
      const deletedPayee = payeeSchema.parse({
        ...payee,
        deleted: true,
        updatedAt: timestamp,
      });
      await database.payees.put(deletedPayee);
      await scanTransactions(database, async (transaction) => {
        let changed = false;
        const splits = transaction.splits.map((split) => {
          if (
            (split.type === "expense" || split.type === "income") &&
            split.payeeId === payeeId
          ) {
            changed = true;
            return { ...split, payeeId: fallbackPayeeId };
          }
          return split;
        });
        if (changed) {
          await database.transactions.put(
            transactionSchema.parse({
              ...transaction,
              splits,
              updatedAt: timestamp,
            }),
          );
        }
      });
      const schedules = await database.scheduledTransactions.toArray();
      for (const record of schedules) {
        const schedule = scheduledTransactionSchema.parse(record);
        let changed = false;
        const splits = schedule.template.splits.map((split) => {
          if (
            (split.type === "expense" || split.type === "income") &&
            split.payeeId === payeeId
          ) {
            changed = true;
            return { ...split, payeeId: fallbackPayeeId };
          }
          return split;
        });
        if (changed) {
          await database.scheduledTransactions.put(
            scheduledTransactionSchema.parse({
              ...schedule,
              template: { ...schedule.template, splits },
              updatedAt: timestamp,
            }),
          );
        }
      }
    },
  );
}

export async function purgeTrash(
  database: LocaledgerDatabase,
): Promise<number> {
  let purged = 0;
  await database.transaction(
    "rw",
    [
      database.accounts,
      database.categoryGroups,
      database.categories,
      database.payeeGroups,
      database.payees,
      database.labels,
      database.transactions,
      database.scheduledTransactions,
      database.occurrenceRecords,
      database.settings,
    ],
    async () => {
      const timestamp = toUtcIso(new Date());
      const deletedCategoryRecords = (
        await database.categories.filter((record) => record.deleted).toArray()
      ).map((record) => categorySchema.parse(record));
      const deletedCategoryKinds = new Map(
        deletedCategoryRecords.map(
          (category) => [category.id, category.kind] as const,
        ),
      );
      const deletedCategories = [...deletedCategoryKinds.keys()];
      if (deletedCategoryRecords.some((category) => category.builtIn)) {
        throw new Error("Built-in categories cannot be purged");
      }
      const deletedPayees = (
        await database.payees.filter((record) => record.deleted).toArray()
      ).map((record) => payeeSchema.parse(record).id);
      const deletedAccounts = (
        await database.accounts.filter((record) => record.deleted).toArray()
      ).map((record) => accountSchema.parse(record).id);

      for (const accountId of deletedAccounts) {
        if (
          await assertAccountNotInUse(database, accountId, {
            excludeDeletedRecords: true,
          })
        ) {
          throw new DeletedAccountInUseError(accountId);
        }
      }

      if (deletedCategories.length > 0) {
        for (const kind of new Set(deletedCategoryKinds.values())) {
          await assertCategoryFallbackAvailable(database, kind);
        }
      }
      if (deletedPayees.length > 0) {
        await assertPayeeFallbackAvailable(database);
      }

      const deletedSchedules = (
        await database.scheduledTransactions
          .filter((record) => record.deleted)
          .toArray()
      ).map((record) => scheduledTransactionSchema.parse(record).id);
      if (deletedSchedules.length > 0) {
        await database.occurrenceRecords
          .filter((record) => deletedSchedules.includes(record.scheduleId))
          .delete();
      }

      const deletedTransactions = (
        await database.transactions.filter((record) => record.deleted).toArray()
      ).map((record) => transactionSchema.parse(record).id);
      if (deletedTransactions.length > 0) {
        const occurrenceRecords = await database.occurrenceRecords
          .filter(
            (record) =>
              record.transactionId !== undefined &&
              deletedTransactions.includes(record.transactionId),
          )
          .toArray();
        for (const record of occurrenceRecords) {
          const occurrence = occurrenceRecordSchema.parse(record);
          await database.occurrenceRecords.put(
            occurrenceRecordSchema.parse({
              ...occurrence,
              transactionId: undefined,
              updatedAt: timestamp,
            }),
          );
        }
      }

      if (deletedCategories.length > 0) {
        await scanTransactions(database, async (transaction) => {
          let changed = false;
          const splits = transaction.splits.map((split) => {
            if (
              (split.type === "expense" || split.type === "income") &&
              split.categoryId &&
              deletedCategoryKinds.has(split.categoryId)
            ) {
              changed = true;
              return {
                ...split,
                categoryId: categoryFallbackId(split.type),
              };
            }
            return split;
          });
          if (changed) {
            const updated = transactionSchema.parse({
              ...transaction,
              splits,
              updatedAt: timestamp,
            });
            await assertCategoryKindsAvailable(database, updated.splits);
            await database.transactions.put(updated);
          }
        });
        const schedules = await database.scheduledTransactions.toArray();
        for (const record of schedules) {
          const schedule = scheduledTransactionSchema.parse(record);
          let changed = false;
          const splits = schedule.template.splits.map((split) => {
            if (
              (split.type === "expense" || split.type === "income") &&
              split.categoryId &&
              deletedCategoryKinds.has(split.categoryId)
            ) {
              changed = true;
              return {
                ...split,
                categoryId: categoryFallbackId(split.type),
              };
            }
            return split;
          });
          if (changed) {
            const updated = scheduledTransactionSchema.parse({
              ...schedule,
              template: { ...schedule.template, splits },
              updatedAt: timestamp,
            });
            await assertCategoryKindsAvailable(database, updated.template.splits);
            await database.scheduledTransactions.put(updated);
          }
        }
      }

      if (deletedPayees.length > 0) {
        await scanTransactions(database, async (transaction) => {
          let changed = false;
          const splits = transaction.splits.map((split) => {
            if (
              (split.type === "expense" || split.type === "income") &&
              split.payeeId &&
              deletedPayees.includes(split.payeeId)
            ) {
              changed = true;
              return { ...split, payeeId: SEED_IDS.unspecified };
            }
            return split;
          });
          if (changed) {
            await database.transactions.put(
              transactionSchema.parse({
                ...transaction,
                splits,
                updatedAt: timestamp,
              }),
            );
          }
        });
        const schedules = await database.scheduledTransactions.toArray();
        for (const record of schedules) {
          const schedule = scheduledTransactionSchema.parse(record);
          let changed = false;
          const splits = schedule.template.splits.map((split) => {
            if (
              (split.type === "expense" || split.type === "income") &&
              split.payeeId &&
              deletedPayees.includes(split.payeeId)
            ) {
              changed = true;
              return { ...split, payeeId: SEED_IDS.unspecified };
            }
            return split;
          });
          if (changed) {
            await database.scheduledTransactions.put(
              scheduledTransactionSchema.parse({
                ...schedule,
                template: { ...schedule.template, splits },
                updatedAt: timestamp,
              }),
            );
          }
        }
      }

      const deletedLabels = (
        await database.labels.filter((record) => record.deleted).toArray()
      ).map((record) => record.id);
      if (deletedLabels.length > 0) {
        await scanTransactions(database, async (transaction) => {
          const labelIds = transaction.labelIds.filter(
            (labelId) => !deletedLabels.includes(labelId),
          );
          if (labelIds.length !== transaction.labelIds.length) {
            await database.transactions.put(
              transactionSchema.parse({
                ...transaction,
                labelIds,
                updatedAt: timestamp,
              }),
            );
          }
        });
        const schedules = await database.scheduledTransactions.toArray();
        for (const record of schedules) {
          const schedule = scheduledTransactionSchema.parse(record);
          const labelIds = schedule.template.labelIds.filter(
            (labelId) => !deletedLabels.includes(labelId),
          );
          if (labelIds.length !== schedule.template.labelIds.length) {
            await database.scheduledTransactions.put(
              scheduledTransactionSchema.parse({
                ...schedule,
                template: { ...schedule.template, labelIds },
                updatedAt: timestamp,
              }),
            );
          }
        }
      }

      const tables = [
        database.accounts,
        database.categoryGroups,
        database.categories,
        database.payeeGroups,
        database.payees,
        database.labels,
        database.transactions,
        database.scheduledTransactions,
        database.occurrenceRecords,
        database.settings,
      ];
      for (const table of tables) {
        const deletedRecords = await table
          .filter((record) => record.deleted)
          .toArray();
        if (table === database.categoryGroups) {
          const activeGroupIds = new Set(
            (
              await database.categories
                .filter((record) => !record.deleted)
                .toArray()
            ).map((record) => record.groupId),
          );
          const purgeableIds = deletedRecords
            .filter((record) => !activeGroupIds.has(record.id))
            .map((record) => record.id);
          await table.bulkDelete(purgeableIds);
          purged += purgeableIds.length;
        } else if (table === database.payeeGroups) {
          const activeGroupIds = new Set(
            (
              await database.payees
                .filter((record) => !record.deleted)
                .toArray()
            ).flatMap((record) => (record.groupId ? [record.groupId] : [])),
          );
          const purgeableIds = deletedRecords
            .filter((record) => !activeGroupIds.has(record.id))
            .map((record) => record.id);
          await table.bulkDelete(purgeableIds);
          purged += purgeableIds.length;
        } else {
          await table.bulkDelete(deletedRecords.map((record) => record.id));
          purged += deletedRecords.length;
        }
      }
    },
  );
  return purged;
}
