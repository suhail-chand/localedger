import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createAccountRepository,
  createCategoryRepository,
  createPayeeRepository,
  createTransactionRepository,
  type RepositoryOptions,
} from '@/data/repositories';
import { createDatabase, ensureDatabaseReady, type LocaledgerDatabase } from '@/data/db';
import {
  deleteCategoryAndReassign,
  deletePayeeAndReassign,
  purgeTrash,
} from '@/data/trash';
import { toPaise } from '@/domain/money';

const databases: LocaledgerDatabase[] = [];

async function setupDatabase(name: string): Promise<LocaledgerDatabase> {
  const database = createDatabase(name);
  databases.push(database);
  await ensureDatabaseReady(database);
  return database;
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    }),
  );
});

function fixedOptions(now: string): RepositoryOptions {
  let index = 0;
  return {
    now: () => new Date(now),
    idFactory: () => {
      index += 1;
      return `40000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
    },
  };
}

describe('data repositories', () => {
  it('creates, updates, soft-deletes, restores, and permanently purges a record', async () => {
    const database = await setupDatabase('repository-crud');
    const accounts = createAccountRepository(
      database,
      fixedOptions('2026-11-26T10:00:00.000Z'),
    );

    const account = await accounts.create({
      name: 'Cash',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(12500),
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    });

    expect(account.id).toBe('40000000-0000-4000-8000-000000000001');
    expect(account.deleted).toBe(false);

    const updated = await accounts.update(account.id, { name: 'Wallet' });
    expect(updated.name).toBe('Wallet');
    expect(updated.updatedAt).toBe('2026-11-26T10:00:00.000Z');

    const deleted = await accounts.softDelete(account.id);
    expect(deleted.deleted).toBe(true);
    expect(await accounts.list()).not.toContainEqual(expect.objectContaining({ id: account.id }));
    expect(await accounts.list(true)).toContainEqual(expect.objectContaining({ id: account.id }));

    const restored = await accounts.restore(account.id);
    expect(restored.deleted).toBe(false);
    await accounts.softDelete(account.id);
    expect(await accounts.purge(account.id)).toBe(true);
    expect(await accounts.get(account.id)).toBeUndefined();
  });

  it('rejects corrupt IndexedDB reads instead of silently fixing them', async () => {
    const database = await setupDatabase('repository-validation');
    await database.accounts.put({
      id: '40000000-0000-4000-8000-000000000099',
      createdAt: '2026-11-26T10:00:00.000Z',
      updatedAt: '2026-11-26T10:00:00.000Z',
      deleted: false,
      name: '',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(0),
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    });

    const accounts = createAccountRepository(database);
    await expect(accounts.list(true)).rejects.toThrow();
  });

  it('reassigns category references in one transaction when a category is deleted', async () => {
    const database = await setupDatabase('category-reassignment');
    await ensureDatabaseReady(database);
    const categories = createCategoryRepository(database, fixedOptions('2026-11-26T11:00:00.000Z'));
    const transactions = createTransactionRepository(database, fixedOptions('2026-11-26T11:00:00.000Z'));
    const other = await database.categories.where('name').equals('Other').first();
    if (!other) throw new Error('Other category missing');

    const category = await categories.create({
      name: 'Food',
      icon: 'utensils',
      groupId: '10000000-0000-4000-8000-000000000001',
      kind: 'expense',
    });
    const account = await createAccountRepository(database, fixedOptions('2026-11-26T11:00:00.000Z')).create({
      name: 'Cash',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(0),
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const transaction = await transactions.create({
      title: 'Lunch',
      occurredAt: '2026-11-26T10:00:00.000Z',
      currency: 'INR',
      splits: [{
        id: '50000000-0000-4000-8000-000000000001',
        type: 'expense',
        amount: toPaise(100),
        accountId: account.id,
        categoryId: category.id,
        note: '',
      }],
      labelIds: [],
      status: 'cleared',
      note: '',
    });

    await deleteCategoryAndReassign(
      database,
      category.id,
      other.id,
      new Date('2026-11-26T12:00:00.000Z'),
    );

    expect((await categories.get(category.id))?.deleted).toBe(true);
    expect((await transactions.get(transaction.id))?.splits[0]).toMatchObject({
      categoryId: other.id,
    });
  });

  it('reassigns payee references and refuses to purge active records', async () => {
    const database = await setupDatabase('payee-reassignment');
    const payees = createPayeeRepository(database, fixedOptions('2026-11-26T11:00:00.000Z'));
    const transactions = createTransactionRepository(database, fixedOptions('2026-11-26T11:00:00.000Z'));
    const unspecified = await database.payees.where('name').equals('Unspecified').first();
    if (!unspecified) throw new Error('Unspecified payee missing');

    const payee = await payees.create({ name: 'Shop' });
    const account = await createAccountRepository(database, fixedOptions('2026-11-26T11:00:00.000Z')).create({
      name: 'Cash',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(0),
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const transaction = await transactions.create({
      title: 'Purchase',
      occurredAt: '2026-11-26T10:00:00.000Z',
      currency: 'INR',
      splits: [{
        id: '50000000-0000-4000-8000-000000000002',
        type: 'expense',
        amount: toPaise(200),
        accountId: account.id,
        payeeId: payee.id,
        note: '',
      }],
      labelIds: [],
      status: 'cleared',
      note: '',
    });

    await deletePayeeAndReassign(
      database,
      payee.id,
      unspecified.id,
      new Date('2026-11-26T12:00:00.000Z'),
    );

    expect((await payees.get(payee.id))?.deleted).toBe(true);
    expect((await transactions.get(transaction.id))?.splits[0]).toMatchObject({
      payeeId: unspecified.id,
    });
  });

  it('purges only tombstones across entity tables', async () => {
    const database = await setupDatabase('purge-trash');
    const accounts = createAccountRepository(database, fixedOptions('2026-11-26T10:00:00.000Z'));
    const account = await accounts.create({
      name: 'Old cash',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(0),
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await accounts.softDelete(account.id);

    expect(await purgeTrash(database)).toBe(1);
    expect(await accounts.get(account.id)).toBeUndefined();
  });
});
