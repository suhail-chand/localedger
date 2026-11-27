import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AccountInUseError,
  AccountUsageCorruptionError,
  TransactionAccountUnavailableError,
  createAccountRepository,
  createCategoryRepository,
  createCategoryGroupRepository,
  createLabelRepository,
  createOccurrenceRepository,
  createPayeeGroupRepository,
  createPayeeRepository,
  createScheduleRepository,
  createTransactionRepository,
  type RepositoryOptions,
} from "@/data/repositories";
import {
  createDatabase,
  ensureDatabaseReady,
  type LocaledgerDatabase,
} from "@/data/db";
import { BuiltInFallbackError, purgeTrash } from "@/data/trash";
import { TransactionDataCorruptionError } from "@/data/transactionScan";
import { SEED_IDS } from "@/data/seed";
import { toPaise } from "@/domain/money";

const databases: LocaledgerDatabase[] = [];

async function setupDatabase(name: string): Promise<LocaledgerDatabase> {
  const database = createDatabase(name);
  databases.push(database);
  await ensureDatabaseReady(database);
  return database;
}

async function getCategoryGroupId(
  database: LocaledgerDatabase,
  name: string,
  kind: "expense" | "income",
): Promise<string> {
  const group = await database.categoryGroups
    .where("name")
    .equals(name)
    .filter((record) => record.kind === kind && !record.deleted)
    .first();

  if (!group) {
    throw new Error(`Missing ${kind} category group: ${name}`);
  }

  return group.id;
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
      return `40000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
    },
  };
}

function transactionRecord(
  accountId: string,
  index: number,
  options: {
    deleted?: boolean;
    type?: "expense" | "transfer";
    toAccountId?: string;
  } = {},
) {
  const { deleted = false, type = "expense", toAccountId } = options;
  const split =
    type === "transfer"
      ? {
          id: `60000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
          type,
          amount: toPaise(100),
          fromAccountId: "40000000-0000-4000-8000-000000000099",
          toAccountId: toAccountId ?? accountId,
          note: "",
        }
      : {
          id: `60000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
          type,
          amount: toPaise(100),
          accountId,
          note: "",
        };
  return {
    id: `50000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    createdAt: "2026-11-26T10:00:00.000Z",
    updatedAt: "2026-11-26T10:00:00.000Z",
    deleted,
    title: "Usage",
    occurredAt: "2026-11-26T10:00:00.000Z",
    currency: "INR" as const,
    splits: [split],
    labelIds: [],
    status: "cleared" as const,
    note: "",
  };
}

describe("data repositories", () => {
  it("checks account usage and soft-deletes inside one Dexie transaction", async () => {
    const database = await setupDatabase("account-atomic-delete");
    const accounts = createAccountRepository(
      database,
      fixedOptions("2026-11-26T10:00:00.000Z"),
    );
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const transactionSpy = vi.spyOn(database, "transaction");

    await accounts.softDelete(account.id);

    expect(transactionSpy).toHaveBeenCalledWith(
      "rw",
      expect.arrayContaining([database.accounts, database.transactions]),
      expect.any(Function),
    );
  });

  it("blocks deleting an account used only by a soft-deleted transaction", async () => {
    const database = await setupDatabase("account-trashed-usage");
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await database.transactions.put(
      transactionRecord(account.id, 1, { deleted: true }),
    );

    await expect(accounts.softDelete(account.id)).rejects.toBeInstanceOf(
      AccountInUseError,
    );
    expect((await accounts.get(account.id))?.deleted).toBe(false);
  });

  it("blocks deleting an account used as a transfer destination", async () => {
    const database = await setupDatabase("account-transfer-destination");
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Destination",
      type: "savings",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await database.transactions.put(
      transactionRecord(account.id, 2, { type: "transfer" }),
    );

    await expect(accounts.softDelete(account.id)).rejects.toBeInstanceOf(
      AccountInUseError,
    );
  });

  it("blocks deleting an account used by a schedule template", async () => {
    const database = await setupDatabase("account-schedule-usage");
    const accounts = createAccountRepository(database);
    const schedules = createScheduleRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "Monthly expense",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000005",
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });

    await expect(accounts.softDelete(account.id)).rejects.toBeInstanceOf(
      AccountInUseError,
    );
  });

  it("treats a corrupt transaction as account usage and reports corruption", async () => {
    const database = await setupDatabase("account-corrupt-usage");
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await database.transactions.put({
      ...transactionRecord(account.id, 3),
      title: "",
    });

    await expect(accounts.softDelete(account.id)).rejects.toBeInstanceOf(
      AccountUsageCorruptionError,
    );
    expect((await accounts.get(account.id))?.deleted).toBe(false);
  });

  it("rejects corruption even when the corrupt transaction has no matching account", async () => {
    const database = await setupDatabase("account-corrupt-unrelated");
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await database.transactions.put({
      ...transactionRecord(account.id, 30),
      title: "",
    });

    await expect(accounts.softDelete(account.id)).rejects.toBeInstanceOf(
      AccountUsageCorruptionError,
    );
  });

  it("allows deleting an unused account", async () => {
    const database = await setupDatabase("account-unused");
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Unused",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    await expect(accounts.softDelete(account.id)).resolves.toMatchObject({
      deleted: true,
    });
  });

  it("does not delete an account when a transaction is added concurrently", async () => {
    const database = await setupDatabase("account-concurrent-transaction");
    const accounts = createAccountRepository(database);
    const transactions = createTransactionRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const accountDeletion = accounts.softDelete(account.id);
    const transactionCreation = transactions.create({
      title: "Concurrent entry",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: transactionRecord(account.id, 4).splits,
      labelIds: [],
      status: "cleared",
      note: "",
    });
    const [created, deleted] = await Promise.allSettled([
      transactionCreation,
      accountDeletion,
    ]);

    if (created.status === "fulfilled") {
      expect(deleted).toMatchObject({
        status: "rejected",
        reason: { message: "Account is in use; hide or archive it instead" },
      });
      expect((await accounts.get(account.id))?.deleted).toBe(false);
    } else {
      expect(deleted.status).toBe("fulfilled");
      expect(created.reason).toBeInstanceOf(TransactionAccountUnavailableError);
      expect((await accounts.get(account.id))?.deleted).toBe(true);
    }
  });

  it("scans 50,000 transactions and logs elapsed time", async () => {
    const database = await setupDatabase("account-usage-50000");
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const records = Array.from({ length: 50_000 }, (_, index) =>
      transactionRecord(
        index === 49_999 ? account.id : "40000000-0000-4000-8000-000000000099",
        index + 1,
      ),
    );
    await database.transactions.bulkPut(records);

    const startedAt = performance.now();
    await expect(accounts.softDelete(account.id)).rejects.toBeInstanceOf(
      AccountInUseError,
    );
    console.log(
      `Account usage scan of 50,000 transactions: ${(performance.now() - startedAt).toFixed(1)}ms`,
    );
  }, 30_000);

  it("creates, updates, soft-deletes, restores, and permanently purges a record", async () => {
    const database = await setupDatabase("repository-crud");
    const accounts = createAccountRepository(
      database,
      fixedOptions("2026-11-26T10:00:00.000Z"),
    );

    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(12500),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    expect(account.id).toBe("40000000-0000-4000-8000-000000000001");
    expect(account.deleted).toBe(false);

    const updated = await accounts.update(account.id, { name: "Wallet" });
    expect(updated.name).toBe("Wallet");
    expect(updated.updatedAt).toBe("2026-11-26T10:00:00.000Z");

    const deleted = await accounts.softDelete(account.id);
    expect(deleted.deleted).toBe(true);
    expect(await accounts.list()).not.toContainEqual(
      expect.objectContaining({ id: account.id }),
    );
    expect(await accounts.list(true)).toContainEqual(
      expect.objectContaining({ id: account.id }),
    );

    const restored = await accounts.restore(account.id);
    expect(restored.deleted).toBe(false);
    await accounts.softDelete(account.id);
    expect(await accounts.purge(account.id)).toBe(true);
    expect(await accounts.get(account.id)).toBeUndefined();
  });

  it("preserves base fields and tombstone state on update", async () => {
    const database = await setupDatabase("repository-update-base-fields");
    const accounts = createAccountRepository(
      database,
      fixedOptions("2026-11-26T11:00:00.000Z"),
    );
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    const changes = {
      ...account,
      name: "Wallet",
      createdAt: "2000-01-01T00:00:00.000Z",
      deleted: true,
    };
    const updated = await accounts.update(account.id, changes);

    expect(updated.createdAt).toBe(account.createdAt);
    expect(updated.deleted).toBe(false);
  });

  it("rejects corrupt IndexedDB reads instead of silently fixing them", async () => {
    const database = await setupDatabase("repository-validation");
    await database.accounts.put({
      id: "40000000-0000-4000-8000-000000000099",
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: false,
      name: "",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    const accounts = createAccountRepository(database);
    await expect(accounts.list(true)).rejects.toThrow();
  });

  it("reassigns category references in one transaction when a category is deleted", async () => {
    const database = await setupDatabase("category-reassignment");
    await ensureDatabaseReady(database);
    const categories = createCategoryRepository(
      database,
      fixedOptions("2026-11-26T11:00:00.000Z"),
    );
    const transactions = createTransactionRepository(
      database,
      fixedOptions("2026-11-26T11:00:00.000Z"),
    );
    const other = await database.categories.get(SEED_IDS.other);
    if (!other) throw new Error("Other category missing");

    const expenseGroupId = await getCategoryGroupId(
      database,
      "Food & Dining",
      "expense",
    );

    const category = await categories.create({
      name: "Food",
      icon: "utensils",
      groupId: expenseGroupId,
      kind: "expense",
    });
    const account = await createAccountRepository(
      database,
      fixedOptions("2026-11-26T11:00:00.000Z"),
    ).create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const transaction = await transactions.create({
      title: "Lunch",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "50000000-0000-4000-8000-000000000001",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          categoryId: category.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });

    await categories.softDelete(category.id);

    expect((await categories.get(category.id))?.deleted).toBe(true);
    expect((await transactions.get(transaction.id))?.splits[0]).toMatchObject({
      categoryId: other.id,
    });
  });

  it("reassigns deleted income categories to Income Other in transactions and schedules", async () => {
    const database = await setupDatabase("income-category-reassignment");
    const categories = createCategoryRepository(database);
    const transactions = createTransactionRepository(database);
    const schedules = createScheduleRepository(database);
    const account = await createAccountRepository(database).create({
      name: "Bank",
      type: "savings",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const incomeGroupId = await getCategoryGroupId(
      database,
      "Employment",
      "income",
    );
    const category = await categories.create({
      name: "Salary",
      icon: "briefcase",
      groupId: incomeGroupId,
      kind: "income",
    });
    const transaction = await transactions.create({
      title: "Pay",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "60000000-0000-4000-8000-000000000071",
          type: "income",
          amount: toPaise(1000),
          accountId: account.id,
          categoryId: category.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    const schedule = await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "Pay",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000072",
            type: "income",
            amount: toPaise(1000),
            accountId: account.id,
            categoryId: category.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });

    await categories.softDelete(category.id);

    expect(await database.categories.get(SEED_IDS.incomeOther)).toMatchObject({
      name: "Other",
      kind: "income",
      groupId: SEED_IDS.incomeOtherGroup,
      builtIn: true,
      deleted: false,
    });
    expect((await transactions.get(transaction.id))?.splits[0]).toMatchObject({
      type: "income",
      categoryId: SEED_IDS.incomeOther,
    });
    expect(
      (await schedules.get(schedule.id))?.template.splits[0],
    ).toMatchObject({
      type: "income",
      categoryId: SEED_IDS.incomeOther,
    });
  });

  it("fails closed when category reassignment encounters unrelated corrupt data", async () => {
    const database = await setupDatabase("category-corrupt-unrelated");
    await ensureDatabaseReady(database);
    const categories = createCategoryRepository(database);
    const expenseGroupId = await getCategoryGroupId(
      database,
      "Food & Dining",
      "expense",
    );
    const category = await categories.create({
      name: "Food",
      icon: "utensils",
      groupId: expenseGroupId,
      kind: "expense",
    });
    await database.transactions.put({
      ...transactionRecord(category.id, 31),
      title: "",
    });

    await expect(categories.softDelete(category.id)).rejects.toBeInstanceOf(
      TransactionDataCorruptionError,
    );
  });

  it("rejects a same-name category fallback whose ID is not the seeded ID", async () => {
    const database = await setupDatabase("category-invalid-fallback-id");
    const categories = createCategoryRepository(database);
    const expenseGroupId = await getCategoryGroupId(
      database,
      "Food & Dining",
      "expense",
    );
    const category = await categories.create({
      name: "Food",
      icon: "utensils",
      groupId: expenseGroupId,
      kind: "expense",
    });
    await database.categories.delete("20000000-0000-4000-8000-000000000001");
    await database.categories.put({
      id: "20000000-0000-4000-8000-000000000099",
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: false,
      name: "Other",
      icon: "ellipsis",
      groupId: "10000000-0000-4000-8000-000000000001",
      kind: "expense",
      builtIn: true,
    });

    await expect(categories.softDelete(category.id)).rejects.toBeInstanceOf(
      BuiltInFallbackError,
    );
    expect((await categories.get(category.id))?.deleted).toBe(false);
  });

  it("fails closed when payee reassignment encounters unrelated corrupt data", async () => {
    const database = await setupDatabase("payee-corrupt-unrelated");
    const payees = createPayeeRepository(database);
    const payee = await payees.create({ name: "Shop" });
    await database.transactions.put({
      ...transactionRecord(payee.id, 32),
      title: "",
    });

    await expect(payees.softDelete(payee.id)).rejects.toBeInstanceOf(
      TransactionDataCorruptionError,
    );
  });

  it("rejects a corrupted payee fallback without deleting the payee", async () => {
    const database = await setupDatabase("payee-corrupt-fallback");
    const payees = createPayeeRepository(database);
    const payee = await payees.create({ name: "Shop" });
    await database.payees.put({
      id: "30000000-0000-4000-8000-000000000001",
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: false,
      name: "",
      builtIn: true,
    });

    await expect(payees.softDelete(payee.id)).rejects.toBeInstanceOf(
      BuiltInFallbackError,
    );
    expect((await payees.get(payee.id))?.deleted).toBe(false);
  });

  it("protects the built-in Unspecified payee from editing", async () => {
    const database = await setupDatabase("payee-builtin-edit");
    const payees = createPayeeRepository(database);
    const unspecified = await database.payees
      .where("name")
      .equals("Unspecified")
      .first();
    if (!unspecified) throw new Error("Unspecified payee missing");

    await expect(
      payees.update(unspecified.id, { name: "Other" }),
    ).rejects.toThrow("Built-in payees cannot be edited");
    expect((await payees.get(unspecified.id))?.name).toBe("Unspecified");
  });

  it("reassigns payee references and refuses to purge active records", async () => {
    const database = await setupDatabase("payee-reassignment");
    const payees = createPayeeRepository(
      database,
      fixedOptions("2026-11-26T11:00:00.000Z"),
    );
    const transactions = createTransactionRepository(
      database,
      fixedOptions("2026-11-26T11:00:00.000Z"),
    );
    const unspecified = await database.payees
      .where("name")
      .equals("Unspecified")
      .first();
    if (!unspecified) throw new Error("Unspecified payee missing");

    const payee = await payees.create({ name: "Shop" });
    const account = await createAccountRepository(
      database,
      fixedOptions("2026-11-26T11:00:00.000Z"),
    ).create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const transaction = await transactions.create({
      title: "Purchase",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "50000000-0000-4000-8000-000000000002",
          type: "expense",
          amount: toPaise(200),
          accountId: account.id,
          payeeId: payee.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });

    await payees.softDelete(payee.id);

    expect((await payees.get(payee.id))?.deleted).toBe(true);
    expect((await transactions.get(transaction.id))?.splits[0]).toMatchObject({
      payeeId: unspecified.id,
    });
  });

  it("fails closed when label removal encounters unrelated corrupt data", async () => {
    const database = await setupDatabase("label-corrupt-unrelated");
    const labels = createLabelRepository(database);
    const label = await labels.create({
      name: "Travel",
      color: "#123456",
    });
    await database.transactions.put({
      ...transactionRecord(label.id, 33),
      title: "",
    });

    await expect(labels.softDelete(label.id)).rejects.toBeInstanceOf(
      TransactionDataCorruptionError,
    );
  });

  it("purges only tombstones across entity tables", async () => {
    const database = await setupDatabase("purge-trash");
    const accounts = createAccountRepository(
      database,
      fixedOptions("2026-11-26T10:00:00.000Z"),
    );
    const account = await accounts.create({
      name: "Old cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await accounts.softDelete(account.id);

    expect(await purgeTrash(database)).toBe(1);
    expect(await accounts.get(account.id)).toBeUndefined();
  });

  it("refuses to purge a tombstoned account still referenced by a schedule", async () => {
    const database = await setupDatabase("purge-account-schedule");
    const accounts = createAccountRepository(database);
    const schedules = createScheduleRepository(database);
    const account = await accounts.create({
      name: "Old cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "Old expense",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000006",
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });
    await database.accounts.put({ ...account, deleted: true });

    await expect(accounts.purge(account.id)).rejects.toBeInstanceOf(
      AccountInUseError,
    );
    await expect(purgeTrash(database)).rejects.toThrow("Cannot purge account");
  });

  it("purges a tombstoned account with references only in trashed records", async () => {
    const database = await setupDatabase("purge-trashed-account-references");
    const accounts = createAccountRepository(database);
    const schedules = createScheduleRepository(database);
    const account = await accounts.create({
      name: "Old cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const schedule = await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "Old expense",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000007",
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });
    await schedules.softDelete(schedule.id);
    await database.transactions.put(
      transactionRecord(account.id, 48, { deleted: true }),
    );
    await database.accounts.put({ ...account, deleted: true });

    expect(await purgeTrash(database)).toBe(3);
    expect(await accounts.get(account.id)).toBeUndefined();
    expect(await schedules.get(schedule.id)).toBeUndefined();
  });

  it("does not purge category tombstones when the Other fallback is missing", async () => {
    const database = await setupDatabase("purge-missing-other-fallback");
    const categoryId = "20000000-0000-4000-8000-000000000099";
    const transaction = transactionRecord(
      "40000000-0000-4000-8000-000000000099",
      46,
    );
    await database.categories.put({
      id: categoryId,
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: true,
      name: "Removed category",
      icon: "tag",
      groupId: SEED_IDS.expenseGroup,
      kind: "expense",
    });
    await database.transactions.put({
      ...transaction,
      splits: transaction.splits.map((split) =>
        split.type === "transfer" ? split : { ...split, categoryId },
      ),
    });
    await database.categories.delete(SEED_IDS.other);

    await expect(purgeTrash(database)).rejects.toBeInstanceOf(
      BuiltInFallbackError,
    );
    expect(await database.categories.get(categoryId)).toMatchObject({
      deleted: true,
    });
    expect(
      (await database.transactions.get(transaction.id))?.splits[0],
    ).toMatchObject({
      categoryId,
    });
  });

  it("does not purge payee tombstones when the Unspecified fallback is missing", async () => {
    const database = await setupDatabase("purge-missing-unspecified-fallback");
    const payeeId = "30000000-0000-4000-8000-000000000099";
    const transaction = transactionRecord(
      "40000000-0000-4000-8000-000000000099",
      47,
    );
    await database.payees.put({
      id: payeeId,
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: true,
      name: "Removed payee",
    });
    await database.transactions.put({
      ...transaction,
      splits: transaction.splits.map((split) =>
        split.type === "transfer" ? split : { ...split, payeeId },
      ),
    });
    await database.payees.delete(SEED_IDS.unspecified);

    await expect(purgeTrash(database)).rejects.toBeInstanceOf(
      BuiltInFallbackError,
    );
    expect(await database.payees.get(payeeId)).toMatchObject({ deleted: true });
    expect(
      (await database.transactions.get(transaction.id))?.splits[0],
    ).toMatchObject({
      payeeId,
    });
  });

  it("does not allow editing the built-in category", async () => {
    const database = await setupDatabase("category-built-in-edit");
    await ensureDatabaseReady(database);
    const categories = createCategoryRepository(database);
    const other = await database.categories.get(SEED_IDS.other);
    if (!other) throw new Error("Other category missing");

    await expect(
      categories.update(other.id, { name: "Renamed" }),
    ).rejects.toThrow("Built-in categories cannot be edited");
    await expect(categories.softDelete(other.id)).rejects.toThrow(
      "Built-in categories cannot be deleted",
    );
    await database.categories.put({ ...other, deleted: true });
    await expect(categories.purge(other.id)).rejects.toThrow(
      "Built-in categories cannot be purged",
    );
  });

  it("does not allow changing a category group kind with mismatched categories", async () => {
    const database = await setupDatabase("category-group-kind-update");
    await ensureDatabaseReady(database);
    const groups = createCategoryGroupRepository(database);
    const categories = createCategoryRepository(database);
    const group = await groups.create({ name: "Mixed", kind: "expense" });
    await categories.create({
      name: "Expense category",
      icon: "tag",
      groupId: group.id,
      kind: "expense",
    });

    await expect(groups.update(group.id, { kind: "income" })).rejects.toThrow(
      "Category group kind cannot differ",
    );
  });

  it("blocks deleting groups that still contain active records", async () => {
    const database = await setupDatabase("group-in-use");
    const categoryGroups = createCategoryGroupRepository(database);
    const categories = createCategoryRepository(database);
    const payeeGroups = createPayeeGroupRepository(database);
    const payees = createPayeeRepository(database);

    const categoryGroup = await categoryGroups.create({
      name: "Food",
      kind: "expense",
    });
    await categories.create({
      name: "Groceries",
      icon: "basket",
      groupId: categoryGroup.id,
      kind: "expense",
    });
    await expect(categoryGroups.softDelete(categoryGroup.id)).rejects.toThrow(
      "Category group is in use",
    );

    const payeeGroup = await payeeGroups.create({ name: "Shops" });
    await payees.create({ name: "Market", groupId: payeeGroup.id });
    await expect(payeeGroups.softDelete(payeeGroup.id)).rejects.toThrow(
      "Payee group is in use",
    );
  });

  it("protects the built-in Other category groups", async () => {
    const database = await setupDatabase("protected-other-groups");
    const groups = createCategoryGroupRepository(database);

    await expect(
      groups.update(SEED_IDS.expenseOtherGroup, { name: "Expenses" }),
    ).rejects.toThrow("Built-in Other category groups cannot be edited");
    await expect(groups.softDelete(SEED_IDS.incomeOtherGroup)).rejects.toThrow(
      "Built-in Other category groups cannot be deleted",
    );
    expect(await groups.get(SEED_IDS.expenseOtherGroup)).toMatchObject({
      name: "Other",
      kind: "expense",
      deleted: false,
    });
    expect(await groups.get(SEED_IDS.incomeOtherGroup)).toMatchObject({
      name: "Other",
      kind: "income",
      deleted: false,
    });
  });

  it("keeps groups until their trashed children are purged", async () => {
    const database = await setupDatabase("group-purge-trashed-child");
    const categoryGroups = createCategoryGroupRepository(database);
    const categories = createCategoryRepository(database);
    const payeeGroups = createPayeeGroupRepository(database);
    const payees = createPayeeRepository(database);

    const categoryGroup = await categoryGroups.create({
      name: "Archived expenses",
      kind: "expense",
    });
    const category = await categories.create({
      name: "Archived category",
      icon: "tag",
      groupId: categoryGroup.id,
      kind: "expense",
    });
    await categories.softDelete(category.id);
    await categoryGroups.softDelete(categoryGroup.id);

    await expect(categoryGroups.purge(categoryGroup.id)).rejects.toThrow(
      "Category group is still referenced",
    );
    expect(await categoryGroups.get(categoryGroup.id)).toBeDefined();
    expect(await categories.purge(category.id)).toBe(true);
    expect(await categoryGroups.purge(categoryGroup.id)).toBe(true);

    const payeeGroup = await payeeGroups.create({ name: "Archived payees" });
    const payee = await payees.create({
      name: "Archived payee",
      groupId: payeeGroup.id,
    });
    await payees.softDelete(payee.id);
    await payeeGroups.softDelete(payeeGroup.id);

    await expect(payeeGroups.purge(payeeGroup.id)).rejects.toThrow(
      "Payee group is still referenced",
    );
    expect(await payeeGroups.get(payeeGroup.id)).toBeDefined();
    expect(await payees.purge(payee.id)).toBe(true);
    expect(await payeeGroups.purge(payeeGroup.id)).toBe(true);
  });

  it("reassigns schedule template category and payee references and removes deleted labels", async () => {
    const database = await setupDatabase("schedule-template-reassignment");
    await ensureDatabaseReady(database);
    const categories = createCategoryRepository(database);
    const payees = createPayeeRepository(database);
    const labels = createLabelRepository(database);
    const schedules = createScheduleRepository(database);
    const accounts = createAccountRepository(database);

    const expenseGroupId = await getCategoryGroupId(
      database,
      "Food & Dining",
      "expense",
    );
    const category = await categories.create({
      name: "Food",
      icon: "utensils",
      groupId: expenseGroupId,
      kind: "expense",
    });
    const payee = await payees.create({ name: "Shop" });
    const label = await labels.create({ name: "Weekly", color: "#123456" });
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    const schedule = await schedules.create({
      scheduleType: "recurring",
      template: {
        title: "Groceries",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000001",
            type: "expense",
            amount: toPaise(500),
            accountId: account.id,
            categoryId: category.id,
            payeeId: payee.id,
            note: "",
          },
        ],
        labelIds: [label.id],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "every", n: 1, unit: "week" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });

    await categories.softDelete(category.id);
    await payees.softDelete(payee.id);
    await labels.softDelete(label.id);

    const updated = await schedules.get(schedule.id);
    expect(updated?.template.splits[0]).toMatchObject({
      categoryId: "20000000-0000-4000-8000-000000000001",
      payeeId: "30000000-0000-4000-8000-000000000001",
    });
    expect(updated?.template.labelIds).not.toContain(label.id);
  });

  it("rejects category kinds that do not match their group or split", async () => {
    const database = await setupDatabase("category-kind-integrity");
    const categoryGroups = createCategoryGroupRepository(database);
    const categories = createCategoryRepository(database);
    const transactions = createTransactionRepository(database);
    const accounts = createAccountRepository(database);

    const expenseGroup = await categoryGroups.create({
      name: "Expenses",
      kind: "expense",
    });
    await expect(
      categories.create({
        name: "Wrong kind",
        icon: "tag",
        groupId: expenseGroup.id,
        kind: "income",
      }),
    ).rejects.toThrow("not valid for income categories");

    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const incomeGroupId = await getCategoryGroupId(
      database,
      "Employment",
      "income",
    );
    const incomeCategory = await categories.create({
      name: "Salary",
      icon: "wallet",
      groupId: incomeGroupId,
      kind: "income",
    });
    await expect(
      transactions.create({
        title: "Wrong category kind",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000010",
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            categoryId: incomeCategory.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      }),
    ).rejects.toThrow("not valid for expense transactions");
  });

  it("rejects restoring occurrences with deleted references", async () => {
    const database = await setupDatabase("occurrence-restore-integrity");
    const schedules = createScheduleRepository(database);
    const occurrences = createOccurrenceRepository(database);
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const schedule = await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "Occurrence",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000011",
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });
    const occurrence = await occurrences.create({
      scheduleId: schedule.id,
      occurrenceAt: "2026-11-26T10:00:00.000Z",
      outcome: "skipped",
    });

    await occurrences.softDelete(occurrence.id);
    await schedules.softDelete(schedule.id);

    await expect(occurrences.restore(occurrence.id)).rejects.toThrow(
      "missing or deleted schedule",
    );
  });

  it("purges schedule and transaction references recoverably", async () => {
    const database = await setupDatabase("purge-references");
    const schedules = createScheduleRepository(database);
    const occurrences = createOccurrenceRepository(database);
    const transactions = createTransactionRepository(database);
    const accounts = createAccountRepository(database);
    const account = await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    const schedule = await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "One-time",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000003",
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });
    const scheduleOccurrence = await occurrences.create({
      scheduleId: schedule.id,
      occurrenceAt: "2026-11-26T10:00:00.000Z",
      outcome: "skipped",
    });

    await schedules.softDelete(schedule.id);
    expect(await schedules.purge(schedule.id)).toBe(true);
    expect(await occurrences.get(scheduleOccurrence.id)).toBeUndefined();

    const transactionSchedule = await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "Transaction schedule",
        occurredAt: "2026-11-26T10:00:00.000Z",
        currency: "INR",
        splits: [
          {
            id: "60000000-0000-4000-8000-000000000004",
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });
    const transaction = await transactions.create({
      title: "Recorded",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "60000000-0000-4000-8000-000000000002",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    const transactionOccurrence = await occurrences.create({
      scheduleId: transactionSchedule.id,
      occurrenceAt: "2026-11-26T10:00:00.000Z",
      outcome: "recorded",
      transactionId: transaction.id,
    });

    await transactions.softDelete(transaction.id);
    expect(await transactions.purge(transaction.id)).toBe(true);
    const occurrenceAfterPurge = await occurrences.get(
      transactionOccurrence.id,
    );
    expect(occurrenceAfterPurge?.transactionId).toBeUndefined();
  });
});
