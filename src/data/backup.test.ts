import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BackupIntegrityError,
  exportBackup,
  type BackupDocument,
  parseBackupJson,
  restoreBackup,
  restoreLatestSnapshot,
  snapshotExistingDatabase,
} from "@/data/backup";
import {
  createDatabase,
  ensureDatabaseReady,
  type LocaledgerDatabase,
} from "@/data/db";
import {
  createAccountRepository,
  createCategoryGroupRepository,
  createCategoryRepository,
  createOccurrenceRepository,
  createPayeeGroupRepository,
  createPayeeRepository,
  createScheduleRepository,
  createTransactionRepository,
} from "@/data/repositories";
import { LOCAL_SCHEMA_VERSION } from "@/data/migrations";
import { toPaise } from "@/domain/money";

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

describe("JSON backup and restore", () => {
  it("exports every table in one Dexie read transaction", async () => {
    const database = await setupDatabase("backup-read-transaction");
    const transactionSpy = vi.spyOn(database, "transaction");

    await exportBackup(database, new Date("2026-11-26T12:00:00.000Z"));

    expect(transactionSpy).toHaveBeenCalledWith(
      "r",
      expect.any(Array),
      expect.any(Function),
    );
  });

  it("does not include backup snapshots in exported JSON", async () => {
    const database = await setupDatabase("backup-excludes-snapshot-table");
    await snapshotExistingDatabase(database, {
      now: () => new Date("2026-11-26T12:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000099",
    });

    const json = await exportBackup(
      database,
      new Date("2026-11-26T12:30:00.000Z"),
    );
    const exported = parseBackupJson(json);

    expect(exported).not.toHaveProperty("backupSnapshots");
    expect(exported).not.toHaveProperty("data.backupSnapshots");
  });

  it("round-trips all application records through an exported backup", async () => {
    const database = await setupDatabase("backup-round-trip");
    const accounts = createAccountRepository(database, {
      now: () => new Date("2026-11-26T10:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000001",
    });
    await accounts.create({
      name: "Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(12500),
      currency: "INR",
      note: "Primary wallet",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    const json = await exportBackup(
      database,
      new Date("2026-11-26T12:00:00.000Z"),
    );
    const exported = parseBackupJson(json);

    expect(exported.schemaVersion).toBe(LOCAL_SCHEMA_VERSION);
    expect(exported.data.accounts).toHaveLength(1);
    expect(exported.data.accounts[0]?.name).toBe("Cash");
    expect(exported.data.categoryGroups).toHaveLength(2);

    await accounts.softDelete("40000000-0000-4000-8000-000000000001");
    await restoreBackup(database, json, {
      now: () => new Date("2026-11-26T13:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000099",
    });

    expect(await database.backupSnapshots.count()).toBe(1);
    const snapshot = await database.backupSnapshots
      .orderBy("createdAt")
      .reverse()
      .first();
    expect(snapshot?.document.data.accounts[0]).toMatchObject({
      id: "40000000-0000-4000-8000-000000000001",
      deleted: true,
    });
    expect(
      await accounts.get("40000000-0000-4000-8000-000000000001"),
    ).toMatchObject({
      name: "Cash",
      startingBalance: toPaise(12500),
      deleted: false,
    });
  });

  it("refuses to export data with dangling references", async () => {
    const database = await setupDatabase("backup-export-integrity");
    await database.transactions.put({
      id: "50000000-0000-4000-8000-000000000099",
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: false,
      title: "Dangling export",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "60000000-0000-4000-8000-000000000099",
          type: "expense",
          amount: toPaise(100),
          accountId: "40000000-0000-4000-8000-999999999999",
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });

    await expect(
      exportBackup(database, new Date("2026-11-26T12:00:00.000Z")),
    ).rejects.toBeInstanceOf(BackupIntegrityError);
  });

  it("accepts occurrence references to soft-deleted schedules and transactions", async () => {
    const database = await setupDatabase(
      "backup-tombstone-occurrence-references",
    );
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
    const transactions = createTransactionRepository(database);
    const transaction = await transactions.create({
      title: "Recorded occurrence",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: "60000000-0000-4000-8000-000000000001",
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
    const schedules = createScheduleRepository(database);
    const schedule = await schedules.create({
      scheduleType: "one_time",
      template: {
        title: "Recorded occurrence",
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
      },
      recurrence: { type: "once" },
      startAt: "2026-11-26T10:00:00.000Z",
      autoRecord: false,
      status: "active",
    });
    const occurrences = createOccurrenceRepository(database);
    await occurrences.create({
      scheduleId: schedule.id,
      occurrenceAt: "2026-11-26T10:00:00.000Z",
      outcome: "recorded",
      transactionId: transaction.id,
    });
    await transactions.softDelete(transaction.id);
    await schedules.softDelete(schedule.id);

    const json = await exportBackup(
      database,
      new Date("2026-11-26T12:00:00.000Z"),
    );
    const document = parseBackupJson(json);

    expect(document.data.transactions[0]?.deleted).toBe(true);
    expect(document.data.scheduledTransactions[0]?.deleted).toBe(true);
    expect(document.data.occurrenceRecords[0]?.transactionId).toBe(
      transaction.id,
    );
    await expect(restoreBackup(database, json)).resolves.toMatchObject({
      currentDataSnapshotted: true,
    });
  });

  it("exports references between trashed children and trashed groups", async () => {
    const database = await setupDatabase("backup-trashed-groups");
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

    const payeeGroup = await payeeGroups.create({ name: "Archived payees" });
    const payee = await payees.create({
      name: "Archived payee",
      groupId: payeeGroup.id,
    });
    await payees.softDelete(payee.id);
    await payeeGroups.softDelete(payeeGroup.id);

    const document = parseBackupJson(
      await exportBackup(database, new Date("2026-11-26T12:00:00.000Z")),
    );

    expect(document.data.categories).toContainEqual(
      expect.objectContaining({ id: category.id, deleted: true }),
    );
    expect(document.data.categoryGroups).toContainEqual(
      expect.objectContaining({ id: categoryGroup.id, deleted: true }),
    );
    expect(document.data.payees).toContainEqual(
      expect.objectContaining({ id: payee.id, deleted: true }),
    );
    expect(document.data.payeeGroups).toContainEqual(
      expect.objectContaining({ id: payeeGroup.id, deleted: true }),
    );
  });

  it("rejects invalid JSON and corrupt backup data", async () => {
    const database = await setupDatabase("backup-invalid");

    await expect(restoreBackup(database, "{not json")).rejects.toThrow(
      "Backup JSON is invalid",
    );
    await expect(
      restoreBackup(
        database,
        JSON.stringify({
          schemaVersion: LOCAL_SCHEMA_VERSION,
          exportedAt: "2026-11-26T12:00:00.000Z",
          data: { accounts: [{ id: "bad" }] },
        }),
      ),
    ).rejects.toThrow();

    expect(await database.backupSnapshots.count()).toBe(0);
  });

  it.each([
    {
      kind: "splitAccount",
      mutate: (document: BackupDocument) => {
        document.data.transactions.push({
          id: "50000000-0000-4000-8000-000000000001",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          title: "Dangling account",
          occurredAt: "2026-11-26T12:00:00.000Z",
          currency: "INR",
          splits: [
            {
              id: "60000000-0000-4000-8000-000000000001",
              type: "expense",
              amount: toPaise(100),
              accountId: "40000000-0000-4000-8000-999999999999",
              note: "",
            },
          ],
          labelIds: [],
          status: "cleared",
          note: "",
        });
      },
    },
    {
      kind: "splitCategory",
      mutate: (document: BackupDocument) => {
        document.data.transactions.push({
          id: "50000000-0000-4000-8000-000000000002",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          title: "Dangling category",
          occurredAt: "2026-11-26T12:00:00.000Z",
          currency: "INR",
          splits: [
            {
              id: "60000000-0000-4000-8000-000000000002",
              type: "expense",
              amount: toPaise(100),
              accountId: document.data.accounts[0]?.id ?? "",
              categoryId: "20000000-0000-4000-8000-999999999999",
              note: "",
            },
          ],
          labelIds: [],
          status: "cleared",
          note: "",
        });
      },
    },
    {
      kind: "splitPayee",
      mutate: (document: BackupDocument) => {
        document.data.transactions.push({
          id: "50000000-0000-4000-8000-000000000003",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          title: "Dangling payee",
          occurredAt: "2026-11-26T12:00:00.000Z",
          currency: "INR",
          splits: [
            {
              id: "60000000-0000-4000-8000-000000000003",
              type: "expense",
              amount: toPaise(100),
              accountId: document.data.accounts[0]?.id ?? "",
              payeeId: "30000000-0000-4000-8000-999999999999",
              note: "",
            },
          ],
          labelIds: [],
          status: "cleared",
          note: "",
        });
      },
    },
    {
      kind: "label",
      mutate: (document: BackupDocument) => {
        document.data.transactions.push({
          id: "50000000-0000-4000-8000-000000000004",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          title: "Dangling label",
          occurredAt: "2026-11-26T12:00:00.000Z",
          currency: "INR",
          splits: [
            {
              id: "60000000-0000-4000-8000-000000000004",
              type: "expense",
              amount: toPaise(100),
              accountId: document.data.accounts[0]?.id ?? "",
              note: "",
            },
          ],
          labelIds: ["70000000-0000-4000-8000-999999999999"],
          status: "cleared",
          note: "",
        });
      },
    },
    {
      kind: "templateSplitAccount",
      mutate: (document: BackupDocument) => {
        document.data.scheduledTransactions.push({
          id: "80000000-0000-4000-8000-000000000001",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          scheduleType: "recurring",
          template: {
            title: "Dangling template account",
            occurredAt: "2026-11-26T12:00:00.000Z",
            currency: "INR",
            splits: [
              {
                id: "60000000-0000-4000-8000-000000000005",
                type: "expense",
                amount: toPaise(100),
                accountId: "40000000-0000-4000-8000-999999999999",
                note: "",
              },
            ],
            labelIds: [],
            status: "cleared",
            note: "",
          },
          recurrence: { type: "every", n: 1, unit: "month" },
          startAt: "2026-11-26T12:00:00.000Z",
          autoRecord: false,
          status: "active",
        });
      },
    },
    {
      kind: "templateSplitCategory",
      mutate: (document: BackupDocument) => {
        document.data.scheduledTransactions.push({
          id: "80000000-0000-4000-8000-000000000002",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          scheduleType: "recurring",
          template: {
            title: "Dangling template category",
            occurredAt: "2026-11-26T12:00:00.000Z",
            currency: "INR",
            splits: [
              {
                id: "60000000-0000-4000-8000-000000000006",
                type: "expense",
                amount: toPaise(100),
                accountId: document.data.accounts[0]?.id ?? "",
                categoryId: "20000000-0000-4000-8000-999999999999",
                note: "",
              },
            ],
            labelIds: [],
            status: "cleared",
            note: "",
          },
          recurrence: { type: "every", n: 1, unit: "month" },
          startAt: "2026-11-26T12:00:00.000Z",
          autoRecord: false,
          status: "active",
        });
      },
    },
    {
      kind: "templateSplitPayee",
      mutate: (document: BackupDocument) => {
        document.data.scheduledTransactions.push({
          id: "80000000-0000-4000-8000-000000000003",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          scheduleType: "recurring",
          template: {
            title: "Dangling template payee",
            occurredAt: "2026-11-26T12:00:00.000Z",
            currency: "INR",
            splits: [
              {
                id: "60000000-0000-4000-8000-000000000007",
                type: "expense",
                amount: toPaise(100),
                accountId: document.data.accounts[0]?.id ?? "",
                payeeId: "30000000-0000-4000-8000-999999999999",
                note: "",
              },
            ],
            labelIds: [],
            status: "cleared",
            note: "",
          },
          recurrence: { type: "every", n: 1, unit: "month" },
          startAt: "2026-11-26T12:00:00.000Z",
          autoRecord: false,
          status: "active",
        });
      },
    },
    {
      kind: "templateLabel",
      mutate: (document: BackupDocument) => {
        document.data.scheduledTransactions.push({
          id: "80000000-0000-4000-8000-000000000004",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          scheduleType: "recurring",
          template: {
            title: "Dangling template label",
            occurredAt: "2026-11-26T12:00:00.000Z",
            currency: "INR",
            splits: [
              {
                id: "60000000-0000-4000-8000-000000000008",
                type: "expense",
                amount: toPaise(100),
                accountId: document.data.accounts[0]?.id ?? "",
                note: "",
              },
            ],
            labelIds: ["70000000-0000-4000-8000-999999999999"],
            status: "cleared",
            note: "",
          },
          recurrence: { type: "every", n: 1, unit: "month" },
          startAt: "2026-11-26T12:00:00.000Z",
          autoRecord: false,
          status: "active",
        });
      },
    },
    {
      kind: "builtInCategory",
      mutate: (document: BackupDocument) => {
        const other = document.data.categories.find((record) => record.builtIn);
        if (other) other.deleted = true;
      },
    },
    {
      kind: "builtInPayee",
      mutate: (document: BackupDocument) => {
        const unspecified = document.data.payees.find(
          (record) => record.builtIn,
        );
        if (unspecified) unspecified.deleted = true;
      },
    },
    {
      kind: "categoryKind",
      mutate: (document: BackupDocument) => {
        const other = document.data.categories.find(
          (record) => record.id === "20000000-0000-4000-8000-000000000001",
        );
        if (other) other.kind = "income";
      },
    },
    {
      kind: "splitCategoryKind",
      mutate: (document: BackupDocument) => {
        document.data.categories.push({
          id: "20000000-0000-4000-8000-999999999997",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          name: "Income category",
          icon: "tag",
          groupId: "10000000-0000-4000-8000-000000000002",
          kind: "income",
        });
        document.data.transactions.push({
          id: "50000000-0000-4000-8000-000000000005",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          title: "Wrong category kind",
          occurredAt: "2026-11-26T12:00:00.000Z",
          currency: "INR",
          splits: [
            {
              id: "60000000-0000-4000-8000-000000000005",
              type: "expense",
              amount: toPaise(100),
              accountId: document.data.accounts[0]?.id ?? "",
              categoryId: "20000000-0000-4000-8000-999999999997",
              note: "",
            },
          ],
          labelIds: [],
          status: "cleared",
          note: "",
        });
      },
    },
    {
      kind: "categoryGroup",
      mutate: (document: BackupDocument) => {
        document.data.categories.push({
          id: "20000000-0000-4000-8000-999999999998",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          name: "Dangling group",
          icon: "tag",
          groupId: "10000000-0000-4000-8000-999999999998",
          kind: "expense",
        });
      },
    },
    {
      kind: "payeeGroup",
      mutate: (document: BackupDocument) => {
        document.data.payees.push({
          id: "30000000-0000-4000-8000-999999999998",
          createdAt: "2026-11-26T12:00:00.000Z",
          updatedAt: "2026-11-26T12:00:00.000Z",
          deleted: false,
          name: "Dangling payee group",
          groupId: "11000000-0000-4000-8000-999999999998",
        });
      },
    },
  ])(
    "rejects $kind dangling references without replacing live data",
    async ({ kind, mutate }) => {
      const database = await setupDatabase(`backup-integrity-${kind}`);
      const accounts = createAccountRepository(database, {
        now: () => new Date("2026-11-26T10:00:00.000Z"),
        idFactory: () => "40000000-0000-4000-8000-000000000001",
      });
      await accounts.create({
        name: "Live account",
        type: "cash",
        openingDate: "2026-11-26T00:00:00.000Z",
        startingBalance: toPaise(1234),
        currency: "INR",
        note: "",
        hideFromTransactions: false,
        hideFromReports: false,
      });

      const json = await exportBackup(
        database,
        new Date("2026-11-26T12:00:00.000Z"),
      );
      const document = parseBackupJson(json);
      mutate(document);

      await expect(
        restoreBackup(database, JSON.stringify(document)),
      ).rejects.toBeInstanceOf(BackupIntegrityError);
      expect(await database.backupSnapshots.count()).toBe(0);
      expect(
        await accounts.get("40000000-0000-4000-8000-000000000001"),
      ).toMatchObject({
        name: "Live account",
        startingBalance: toPaise(1234),
      });
    },
  );

  it("rejects a backup from a newer schema before creating a snapshot", async () => {
    const database = await setupDatabase("backup-newer");
    const json = await exportBackup(
      database,
      new Date("2026-11-26T12:00:00.000Z"),
    );
    const parsed = parseBackupJson(json);

    await expect(
      restoreBackup(
        database,
        JSON.stringify({
          ...parsed,
          schemaVersion: LOCAL_SCHEMA_VERSION + 1,
        }),
      ),
    ).rejects.toThrow("is newer than supported version");
    expect(await database.backupSnapshots.count()).toBe(0);
  });

  it("rejects duplicate IDs", async () => {
    const database = await setupDatabase("backup-duplicates");
    const accounts = createAccountRepository(database, {
      now: () => new Date("2026-11-26T10:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000001",
    });
    await accounts.create({
      name: "Duplicate",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const json = await exportBackup(
      database,
      new Date("2026-11-26T12:00:00.000Z"),
    );
    const parsed = parseBackupJson(json);

    const first = parsed.data.accounts[0];
    if (!first) throw new Error("Backup account missing");
    parsed.data.accounts.push(first);

    expect(() => parseBackupJson(JSON.stringify(parsed))).toThrow(
      "Backup contains duplicate record IDs",
    );
  });

  it("snapshots live data before restoring the latest snapshot", async () => {
    const database = await setupDatabase("backup-snapshot");
    const accounts = createAccountRepository(database, {
      now: () => new Date("2026-11-26T10:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000001",
    });
    await accounts.create({
      name: "Original",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(1000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    await snapshotExistingDatabase(database, {
      now: () => new Date("2026-11-26T12:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000099",
    });
    await database.accounts.clear();

    const result = await restoreLatestSnapshot(database, {
      now: () => new Date("2026-11-26T13:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000098",
    });

    expect(result.snapshot.id).toBe("40000000-0000-4000-8000-000000000099");
    expect(result.currentDataSnapshotted).toBe(true);
    expect(await database.backupSnapshots.count()).toBe(2);
    const liveStateSnapshot = await database.backupSnapshots
      .orderBy("createdAt")
      .reverse()
      .first();
    expect(liveStateSnapshot?.id).toBe("40000000-0000-4000-8000-000000000098");
    expect(liveStateSnapshot?.document.data.accounts).toHaveLength(0);
    expect(
      await accounts.get("40000000-0000-4000-8000-000000000001"),
    ).toMatchObject({
      name: "Original",
      startingBalance: toPaise(1000),
    });
  });

  it("restores a valid snapshot when current records fail backup validation", async () => {
    const database = await setupDatabase("backup-snapshot-corrupt-current");
    const accounts = createAccountRepository(database, {
      now: () => new Date("2026-11-26T10:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000001",
    });
    const account = await accounts.create({
      name: "Recoverable",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(1000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await snapshotExistingDatabase(database, {
      now: () => new Date("2026-11-26T12:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000099",
    });
    await database.accounts.put({ ...account, name: "" });

    const result = await restoreLatestSnapshot(database);

    expect(result.currentDataSnapshotted).toBe(false);
    expect(result.snapshot.id).toBe("40000000-0000-4000-8000-000000000099");
    expect(await database.backupSnapshots.count()).toBe(1);
    expect(await accounts.get(account.id)).toMatchObject({
      name: "Recoverable",
    });
  });

  it("restores a validated backup when current records fail backup validation", async () => {
    const database = await setupDatabase("backup-import-corrupt-current");
    const accounts = createAccountRepository(database, {
      now: () => new Date("2026-11-26T10:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000001",
    });
    const account = await accounts.create({
      name: "Recoverable",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(1000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const backup = await exportBackup(database);
    await database.accounts.put({ ...account, name: "" });

    const result = await restoreBackup(database, backup);

    expect(result.currentDataSnapshotted).toBe(false);
    expect(await database.backupSnapshots.count()).toBe(0);
    expect(await accounts.get(account.id)).toMatchObject({
      name: "Recoverable",
    });
  });

  it("does not replace data when creating its pre-restore snapshot fails", async () => {
    const database = await setupDatabase("backup-invalid-snapshot-id");
    const accounts = createAccountRepository(database, {
      now: () => new Date("2026-11-26T10:00:00.000Z"),
      idFactory: () => "40000000-0000-4000-8000-000000000001",
    });
    const account = await accounts.create({
      name: "Backup value",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(1000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const backup = await exportBackup(database);
    await accounts.update(account.id, { name: "Current value" });

    await expect(
      restoreBackup(database, backup, {
        idFactory: () => "invalid snapshot id",
      }),
    ).rejects.toThrow();

    expect(await accounts.get(account.id)).toMatchObject({
      name: "Current value",
    });
  });
});
