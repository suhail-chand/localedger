import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDatabase,
  ensureDatabaseReady,
  type LocaledgerDatabase,
} from "@/data/db";
import {
  AccountUsageCorruptionError,
  CategoryGroupKindMismatchError,
  CategoryKindMismatchError,
  GroupReferenceUnavailableError,
  OccurrenceReferenceUnavailableError,
  TransactionAccountUnavailableError,
  TransactionReferenceUnavailableError,
  assertAccountNotInUse,
  assertCategoryGroupAvailable,
  assertCategoryKindAvailable,
  assertOccurrenceReferencesAvailable,
  assertPayeeGroupAvailable,
  assertTransactionReferencesAvailable,
} from "@/data/referenceIntegrity";
import {
  TransactionDataCorruptionError,
  scanTransactions,
} from "@/data/transactionScan";
import { toPaise } from "@/domain/money";
import type { OccurrenceRecord, Transaction } from "@/domain/types";

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

const timestamp = "2026-11-26T10:00:00.000Z";
const accountId = "40000000-0000-4000-8000-000000000001";
const categoryId = "20000000-0000-4000-8000-000000000004";
const payeeId = "30000000-0000-4000-8000-000000000002";

function expenseTransaction(
  options: { includeReferences?: boolean } = {},
): Transaction {
  const includeReferences = options.includeReferences ?? true;
  return {
    id: "50000000-0000-4000-8000-000000000001",
    createdAt: timestamp,
    updatedAt: timestamp,
    deleted: false,
    title: "Groceries",
    occurredAt: timestamp,
    currency: "INR",
    splits: [
      {
        id: "60000000-0000-4000-8000-000000000001",
        type: "expense",
        amount: toPaise(125),
        accountId,
        ...(includeReferences ? { categoryId, payeeId } : {}),
        note: "",
      },
    ],
    labelIds: [],
    status: "cleared",
    note: "",
  };
}

describe("data reference integrity", () => {
  it("rejects a transaction that references a missing account", async () => {
    const database = await setupDatabase("integrity-missing-account");

    await expect(
      assertTransactionReferencesAvailable(
        database,
        expenseTransaction({ includeReferences: false }),
      ),
    ).rejects.toBeInstanceOf(TransactionAccountUnavailableError);
  });

  it("rejects a deleted category and reports its kind mismatch", async () => {
    const database = await setupDatabase("integrity-category");
    await database.accounts.put({
      id: accountId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted: false,
      name: "Cash",
      type: "cash",
      openingDate: timestamp,
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await database.categories.put({
      id: categoryId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted: false,
      name: "Salary",
      icon: "wallet",
      groupId: "10000000-0000-4000-8000-000000000002",
      kind: "income",
    });

    await expect(
      assertCategoryKindAvailable(database, categoryId, "expense"),
    ).rejects.toBeInstanceOf(CategoryKindMismatchError);

    await database.categories.update(categoryId, { deleted: true });
    await expect(
      assertTransactionReferencesAvailable(database, expenseTransaction()),
    ).rejects.toBeInstanceOf(TransactionReferenceUnavailableError);
  });

  it("rejects a missing payee group", async () => {
    const database = await setupDatabase("integrity-payee-group");

    await expect(
      assertPayeeGroupAvailable(
        database,
        "70000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toBeInstanceOf(GroupReferenceUnavailableError);
  });

  it("rejects a category group with the wrong kind", async () => {
    const database = await setupDatabase("integrity-category-group");
    await database.categoryGroups.put({
      id: "10000000-0000-4000-8000-000000000003",
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted: false,
      name: "Investment",
      kind: "income",
    });

    await expect(
      assertCategoryGroupAvailable(
        database,
        "10000000-0000-4000-8000-000000000003",
        "expense",
      ),
    ).rejects.toBeInstanceOf(CategoryGroupKindMismatchError);
  });

  it("rejects occurrences with missing schedules or transactions", async () => {
    const database = await setupDatabase("integrity-occurrence");
    const baseOccurrence: OccurrenceRecord = {
      id: "80000000-0000-4000-8000-000000000001",
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted: false,
      scheduleId: "90000000-0000-4000-8000-000000000001",
      occurrenceAt: timestamp,
      outcome: "recorded",
      transactionId: "50000000-0000-4000-8000-000000000002",
    };

    await expect(
      assertOccurrenceReferencesAvailable(database, baseOccurrence),
    ).rejects.toBeInstanceOf(OccurrenceReferenceUnavailableError);

    await database.scheduledTransactions.put({
      id: baseOccurrence.scheduleId,
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted: false,
      scheduleType: "one_time",
      template: {
        title: "Rent",
        occurredAt: timestamp,
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000002",
            type: "expense",
            amount: toPaise(100),
            accountId,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: timestamp,
      autoRecord: false,
      status: "active",
    });

    await expect(
      assertOccurrenceReferencesAvailable(database, baseOccurrence),
    ).rejects.toBeInstanceOf(OccurrenceReferenceUnavailableError);
  });

  it("stops transaction scans on corrupt data and supports custom errors", async () => {
    const database = await setupDatabase("integrity-corrupt-scan");
    await database.transactions.put({
      ...expenseTransaction(),
      title: "",
    });

    await expect(
      scanTransactions(database, () => undefined),
    ).rejects.toBeInstanceOf(TransactionDataCorruptionError);

    await expect(
      scanTransactions(database, () => undefined, {
        corruptionError: () => new AccountUsageCorruptionError(),
      }),
    ).rejects.toBeInstanceOf(AccountUsageCorruptionError);
  });

  it("reports account usage safely without false negatives on empty data", async () => {
    const database = await setupDatabase("integrity-account-usage");

    await expect(assertAccountNotInUse(database, accountId)).resolves.toBe(
      false,
    );
  });
});
