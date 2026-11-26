import type { LocaledgerDatabase } from '@/data/db';
import { toUtcIso } from '@/domain/ids';
import { categorySchema, payeeSchema, transactionSchema } from '@/domain/schemas';

export async function deleteCategoryAndReassign(
  database: LocaledgerDatabase,
  categoryId: string,
  fallbackCategoryId: string,
  now = new Date(),
): Promise<void> {
  await database.transaction(
    'rw',
    [database.categories, database.transactions],
    async () => {
      const category = await database.categories.get(categoryId);
      if (!category) {
        throw new Error(`Category ${categoryId} does not exist`);
      }
      if (category.builtIn) {
        throw new Error('Built-in categories cannot be deleted');
      }

      const fallback = await database.categories.get(fallbackCategoryId);
      if (!fallback || fallback.builtIn !== true) {
        throw new Error('Fallback must be a built-in Other category');
      }

      const timestamp = toUtcIso(now);
      const deletedCategory = categorySchema.parse({
        ...category,
        deleted: true,
        updatedAt: timestamp,
      });
      const transactions = await database.transactions.toArray();

      await database.categories.put(deletedCategory);
      for (const transaction of transactions) {
        let changed = false;
        const splits = transaction.splits.map((split) => {
          if (
            (split.type === 'expense' || split.type === 'income') &&
            split.categoryId === categoryId
          ) {
            changed = true;
            return { ...split, categoryId: fallbackCategoryId };
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
    'rw',
    [database.payees, database.transactions],
    async () => {
      const payee = await database.payees.get(payeeId);
      if (!payee) {
        throw new Error(`Payee ${payeeId} does not exist`);
      }
      if (payee.builtIn) {
        throw new Error('Built-in payees cannot be deleted');
      }

      const fallback = await database.payees.get(fallbackPayeeId);
      if (!fallback || fallback.builtIn !== true) {
        throw new Error('Fallback must be a built-in Unspecified payee');
      }

      const timestamp = toUtcIso(now);
      const deletedPayee = payeeSchema.parse({
        ...payee,
        deleted: true,
        updatedAt: timestamp,
      });
      const transactions = await database.transactions.toArray();

      await database.payees.put(deletedPayee);
      for (const transaction of transactions) {
        let changed = false;
        const splits = transaction.splits.map((split) => {
          if (
            (split.type === 'expense' || split.type === 'income') &&
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
      }
    },
  );
}

export async function purgeTrash(database: LocaledgerDatabase): Promise<number> {
  let purged = 0;
  await database.transaction(
    'rw',
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
        const deletedRecords = await table.filter((record) => record.deleted).toArray();
        await table.bulkDelete(deletedRecords.map((record) => record.id));
        purged += deletedRecords.length;
      }
    },
  );
  return purged;
}
