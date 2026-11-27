import { z } from "zod";

import type { BackupSnapshot, LocaledgerDatabase } from "@/data/db";
import { SEED_IDS } from "@/data/seed";
import {
  assertSupportedSchemaVersion,
  LOCAL_SCHEMA_VERSION,
  type SchemaMetadata,
} from "@/data/migrations";
import { toUtcIso, utcIsoSchema, uuidSchema } from "@/domain/ids";
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
const backupDataSchema = z
  .object({
    accounts: z.array(accountSchema),
    categoryGroups: z.array(categoryGroupSchema),
    categories: z.array(categorySchema),
    payeeGroups: z.array(payeeGroupSchema),
    payees: z.array(payeeSchema),
    labels: z.array(labelSchema),
    transactions: z.array(transactionSchema),
    scheduledTransactions: z.array(scheduledTransactionSchema),
    occurrenceRecords: z.array(occurrenceRecordSchema),
    settings: z.array(settingsSchema),
  })
  .strict();

export const backupDocumentSchema = z
  .object({
    schemaVersion: z.number().int().nonnegative(),
    exportedAt: utcIsoSchema,
    data: backupDataSchema,
  })
  .strict();

export type BackupDocument = z.infer<typeof backupDocumentSchema>;

function migrateCategoryFallbacks(document: BackupDocument): BackupDocument {
  if (document.schemaVersion !== 1) {
    return document;
  }

  const reservedIds = [
    SEED_IDS.expenseOtherGroup,
    SEED_IDS.incomeOtherGroup,
    SEED_IDS.incomeOther,
  ];
  const existingIds = new Set([
    ...document.data.categoryGroups.map((record) => record.id),
    ...document.data.categories.map((record) => record.id),
  ]);
  if (reservedIds.some((id) => existingIds.has(id))) {
    throw new Error("Backup uses a reserved built-in category ID");
  }

  const fallbackGroups = [
    {
      id: SEED_IDS.expenseOtherGroup,
      createdAt: document.exportedAt,
      updatedAt: document.exportedAt,
      deleted: false,
      name: "Other",
      kind: "expense" as const,
    },
    {
      id: SEED_IDS.incomeOtherGroup,
      createdAt: document.exportedAt,
      updatedAt: document.exportedAt,
      deleted: false,
      name: "Other",
      kind: "income" as const,
    },
  ];
  const categories = document.data.categories.map((category) =>
    category.id === SEED_IDS.other
      ? {
          ...category,
          groupId: SEED_IDS.expenseOtherGroup,
          updatedAt: document.exportedAt,
        }
      : category,
  );
  categories.push({
    id: SEED_IDS.incomeOther,
    createdAt: document.exportedAt,
    updatedAt: document.exportedAt,
    deleted: false,
    name: "Other",
    icon: "ellipsis",
    groupId: SEED_IDS.incomeOtherGroup,
    kind: "income",
    builtIn: true,
  });

  return backupDocumentSchema.parse({
    ...document,
    schemaVersion: 2,
    data: {
      ...document.data,
      categoryGroups: [...document.data.categoryGroups, ...fallbackGroups],
      categories,
    },
  });
}

export type BackupIntegrityKind =
  | "splitAccount"
  | "splitCategory"
  | "splitCategoryKind"
  | "splitPayee"
  | "label"
  | "templateSplitAccount"
  | "templateSplitCategory"
  | "templateSplitCategoryKind"
  | "templateSplitPayee"
  | "templateLabel"
  | "categoryGroup"
  | "categoryKind"
  | "payeeGroup"
  | "builtInCategory"
  | "builtInPayee"
  | "occurrenceSchedule"
  | "occurrenceTransaction";

export interface BackupIntegrityReport {
  counts: Partial<Record<BackupIntegrityKind, number>>;
  firstFewIds: Partial<Record<BackupIntegrityKind, string[]>>;
}

export interface RestoreBackupResult {
  currentDataSnapshotted: boolean;
}

export interface RestoreLatestSnapshotResult extends RestoreBackupResult {
  snapshot: BackupSnapshot;
}

export class BackupIntegrityError extends Error {
  constructor(public readonly report: BackupIntegrityReport) {
    super("Backup contains dangling references");
    this.name = "BackupIntegrityError";
  }
}

class DuplicateRecordIdsError extends Error {
  constructor() {
    super("Backup contains duplicate record IDs");
    this.name = "DuplicateRecordIdsError";
  }
}

export interface BackupOptions {
  now?: () => Date;
  idFactory?: () => string;
  snapshotsToKeep?: number;
}

function defaultIdFactory(): string {
  return globalThis.crypto.randomUUID();
}

function validateUniqueIds(document: BackupDocument): void {
  const ids = [
    ...document.data.accounts.map((record) => record.id),
    ...document.data.categoryGroups.map((record) => record.id),
    ...document.data.categories.map((record) => record.id),
    ...document.data.payeeGroups.map((record) => record.id),
    ...document.data.payees.map((record) => record.id),
    ...document.data.labels.map((record) => record.id),
    ...document.data.transactions.map((record) => record.id),
    ...document.data.scheduledTransactions.map((record) => record.id),
    ...document.data.occurrenceRecords.map((record) => record.id),
    ...document.data.settings.map((record) => record.id),
  ];

  if (new Set(ids).size !== ids.length) {
    throw new DuplicateRecordIdsError();
  }
}

function validateBackupReferentialIntegrity(document: BackupDocument): void {
  const report: BackupIntegrityReport = { counts: {}, firstFewIds: {} };

  const add = (kind: BackupIntegrityKind, id: string): void => {
    report.counts[kind] = (report.counts[kind] ?? 0) + 1;
    const ids = report.firstFewIds[kind] ?? [];
    if (!ids.includes(id) && ids.length < 5) {
      ids.push(id);
      report.firstFewIds[kind] = ids;
    }
  };

  const activeIds = (records: readonly { id: string; deleted: boolean }[]) =>
    new Set(
      records.filter((record) => !record.deleted).map((record) => record.id),
    );
  const allIds = (records: readonly { id: string }[]) =>
    new Set(records.map((record) => record.id));

  const accountIds = activeIds(document.data.accounts);
  const categoryIds = activeIds(document.data.categories);
  const categoryById = new Map(
    document.data.categories.map((category) => [category.id, category]),
  );
  const categoryGroupById = new Map(
    document.data.categoryGroups.map((group) => [group.id, group]),
  );
  const payeeIds = activeIds(document.data.payees);
  const labelIds = activeIds(document.data.labels);
  const categoryGroupIds = allIds(document.data.categoryGroups);
  const payeeGroupIds = allIds(document.data.payeeGroups);
  const activeCategoryGroupIds = activeIds(document.data.categoryGroups);
  const activePayeeGroupIds = activeIds(document.data.payeeGroups);
  const scheduleIds = allIds(document.data.scheduledTransactions);
  const transactionIds = allIds(document.data.transactions);

  for (const category of document.data.categories) {
    const groupExists = category.deleted
      ? categoryGroupIds.has(category.groupId)
      : activeCategoryGroupIds.has(category.groupId);
    if (!groupExists) {
      add("categoryGroup", category.groupId);
    }
    const group = categoryGroupById.get(category.groupId);
    if (group && group.kind !== category.kind) {
      add("categoryKind", category.id);
    }
  }
  for (const payee of document.data.payees) {
    const groupIds = payee.deleted ? payeeGroupIds : activePayeeGroupIds;
    if (payee.groupId && !groupIds.has(payee.groupId)) {
      add("payeeGroup", payee.groupId);
    }
  }

  for (const fallback of [
    {
      id: SEED_IDS.other,
      groupId: SEED_IDS.expenseOtherGroup,
      kind: "expense",
    },
    {
      id: SEED_IDS.incomeOther,
      groupId: SEED_IDS.incomeOtherGroup,
      kind: "income",
    },
  ] as const) {
    const category = categoryById.get(fallback.id);
    const group = categoryGroupById.get(fallback.groupId);
    if (
      !category ||
      category.deleted ||
      category.builtIn !== true ||
      category.name !== "Other" ||
      category.kind !== fallback.kind ||
      category.groupId !== fallback.groupId ||
      !group ||
      group.deleted ||
      group.name !== "Other" ||
      group.kind !== fallback.kind
    ) {
      add("builtInCategory", fallback.id);
    }
  }
  const unspecified = document.data.payees.find(
    (record) => record.id === SEED_IDS.unspecified,
  );
  if (!unspecified || unspecified.deleted || !unspecified.builtIn) {
    add("builtInPayee", SEED_IDS.unspecified);
  }

  const validateTemplateSplits = (
    splits: (typeof document.data.transactions)[number]["splits"],
    prefix: "template",
  ): void => {
    for (const split of splits) {
      if (split.type === "transfer") {
        if (!accountIds.has(split.fromAccountId)) {
          add(
            prefix === "template" ? "templateSplitAccount" : "splitAccount",
            split.fromAccountId,
          );
        }
        if (!accountIds.has(split.toAccountId)) {
          add(
            prefix === "template" ? "templateSplitAccount" : "splitAccount",
            split.toAccountId,
          );
        }
      } else {
        if (!accountIds.has(split.accountId)) {
          add(
            prefix === "template" ? "templateSplitAccount" : "splitAccount",
            split.accountId,
          );
        }
        if (split.categoryId && !categoryIds.has(split.categoryId)) {
          add(
            prefix === "template" ? "templateSplitCategory" : "splitCategory",
            split.categoryId,
          );
        }
        if (split.categoryId) {
          const category = categoryById.get(split.categoryId);
          if (category && category.kind !== split.type) {
            add(
              prefix === "template"
                ? "templateSplitCategoryKind"
                : "splitCategoryKind",
              split.categoryId,
            );
          }
        }
        if (split.payeeId && !payeeIds.has(split.payeeId)) {
          add(
            prefix === "template" ? "templateSplitPayee" : "splitPayee",
            split.payeeId,
          );
        }
      }
    }
  };

  for (const transaction of document.data.transactions) {
    for (const split of transaction.splits) {
      if (split.type === "transfer") {
        if (!accountIds.has(split.fromAccountId))
          add("splitAccount", split.fromAccountId);
        if (!accountIds.has(split.toAccountId))
          add("splitAccount", split.toAccountId);
      } else {
        if (!accountIds.has(split.accountId))
          add("splitAccount", split.accountId);
        if (split.categoryId && !categoryIds.has(split.categoryId))
          add("splitCategory", split.categoryId);
        if (split.categoryId) {
          const category = categoryById.get(split.categoryId);
          if (category && category.kind !== split.type) {
            add("splitCategoryKind", split.categoryId);
          }
        }
        if (split.payeeId && !payeeIds.has(split.payeeId))
          add("splitPayee", split.payeeId);
      }
    }
    for (const labelId of transaction.labelIds) {
      if (!labelIds.has(labelId)) add("label", labelId);
    }
  }

  for (const schedule of document.data.scheduledTransactions) {
    validateTemplateSplits(schedule.template.splits, "template");
    for (const labelId of schedule.template.labelIds) {
      if (!labelIds.has(labelId)) add("templateLabel", labelId);
    }
  }

  for (const occurrence of document.data.occurrenceRecords) {
    if (!scheduleIds.has(occurrence.scheduleId)) {
      add("occurrenceSchedule", occurrence.scheduleId);
    }
    if (
      occurrence.transactionId &&
      !transactionIds.has(occurrence.transactionId)
    ) {
      add("occurrenceTransaction", occurrence.transactionId);
    }
  }

  if (Object.values(report.counts).some((count) => (count ?? 0) > 0)) {
    throw new BackupIntegrityError(report);
  }
}

export async function exportBackup(
  database: LocaledgerDatabase,
  now = new Date(),
): Promise<string> {
  const document = await database.transaction(
    "r",
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
      const data = {
        accounts: await readValidated(
          database.accounts.toArray(),
          accountSchema,
        ),
        categoryGroups: await readValidated(
          database.categoryGroups.toArray(),
          categoryGroupSchema,
        ),
        categories: await readValidated(
          database.categories.toArray(),
          categorySchema,
        ),
        payeeGroups: await readValidated(
          database.payeeGroups.toArray(),
          payeeGroupSchema,
        ),
        payees: await readValidated(database.payees.toArray(), payeeSchema),
        labels: await readValidated(database.labels.toArray(), labelSchema),
        transactions: await readValidated(
          database.transactions.toArray(),
          transactionSchema,
        ),
        scheduledTransactions: await readValidated(
          database.scheduledTransactions.toArray(),
          scheduledTransactionSchema,
        ),
        occurrenceRecords: await readValidated(
          database.occurrenceRecords.toArray(),
          occurrenceRecordSchema,
        ),
        settings: await readValidated(
          database.settings.toArray(),
          settingsSchema,
        ),
      };
      return {
        schemaVersion: LOCAL_SCHEMA_VERSION,
        exportedAt: toUtcIso(now),
        data,
      } satisfies BackupDocument;
    },
  );

  const parsed = backupDocumentSchema.parse(document);
  validateUniqueIds(parsed);
  validateBackupReferentialIntegrity(parsed);
  return JSON.stringify(parsed, null, 2);
}

async function readValidated<T>(
  recordsPromise: Promise<unknown[]>,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const records = await recordsPromise;
  return records.map((record) => schema.parse(record));
}

export function parseBackupJson(json: string): BackupDocument {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch {
    throw new Error("Backup JSON is invalid");
  }

  const parsed = backupDocumentSchema.parse(parsedJson);
  assertSupportedSchemaVersion(parsed.schemaVersion);
  validateUniqueIds(parsed);
  const document = migrateCategoryFallbacks(parsed);
  validateUniqueIds(document);
  validateBackupReferentialIntegrity(document);
  return document;
}

export async function snapshotExistingDatabase(
  database: LocaledgerDatabase,
  options: BackupOptions = {},
): Promise<BackupSnapshot> {
  const snapshotDocument = parseBackupJson(
    await exportBackup(database, (options.now ?? (() => new Date()))()),
  );
  return storeSnapshot(database, snapshotDocument, options);
}

async function storeSnapshot(
  database: LocaledgerDatabase,
  snapshotDocument: BackupDocument,
  options: BackupOptions,
): Promise<BackupSnapshot> {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;
  const snapshotsToKeep = options.snapshotsToKeep ?? 5;

  if (!Number.isInteger(snapshotsToKeep) || snapshotsToKeep < 1) {
    throw new Error("snapshotsToKeep must be a positive integer");
  }

  const snapshot: BackupSnapshot = {
    id: uuidSchema.parse(idFactory()),
    createdAt: toUtcIso(now()),
    document: snapshotDocument,
  };

  await database.transaction("rw", [database.backupSnapshots], async () => {
    await database.backupSnapshots.put(snapshot);
    const snapshots = await database.backupSnapshots
      .orderBy("createdAt")
      .reverse()
      .toArray();
    if (snapshots.length > snapshotsToKeep) {
      await database.backupSnapshots.bulkDelete(
        snapshots.slice(snapshotsToKeep).map((item) => item.id),
      );
    }
  });
  return snapshot;
}

async function replaceDatabaseData(
  database: LocaledgerDatabase,
  document: BackupDocument,
): Promise<void> {
  await database.transaction(
    "rw",
    [
      database.metadata,
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
      await Promise.all([
        database.accounts.clear(),
        database.categoryGroups.clear(),
        database.categories.clear(),
        database.payeeGroups.clear(),
        database.payees.clear(),
        database.labels.clear(),
        database.transactions.clear(),
        database.scheduledTransactions.clear(),
        database.occurrenceRecords.clear(),
        database.settings.clear(),
      ]);

      await database.accounts.bulkPut(document.data.accounts);
      await database.categoryGroups.bulkPut(document.data.categoryGroups);
      await database.categories.bulkPut(document.data.categories);
      await database.payeeGroups.bulkPut(document.data.payeeGroups);
      await database.payees.bulkPut(document.data.payees);
      await database.labels.bulkPut(document.data.labels);
      await database.transactions.bulkPut(document.data.transactions);
      await database.scheduledTransactions.bulkPut(
        document.data.scheduledTransactions,
      );
      await database.occurrenceRecords.bulkPut(document.data.occurrenceRecords);
      await database.settings.bulkPut(document.data.settings);
      await database.metadata.put({
        key: "schema",
        version: LOCAL_SCHEMA_VERSION,
      } satisfies SchemaMetadata);
    },
  );
}

async function snapshotCurrentDataIfValid(
  database: LocaledgerDatabase,
  options: BackupOptions,
): Promise<boolean> {
  let exported: string;
  try {
    exported = await exportBackup(
      database,
      (options.now ?? (() => new Date()))(),
    );
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      error instanceof BackupIntegrityError ||
      error instanceof DuplicateRecordIdsError
    ) {
      return false;
    }
    throw error;
  }

  const document = parseBackupJson(exported);
  await storeSnapshot(database, document, options);
  return true;
}

export async function restoreBackup(
  database: LocaledgerDatabase,
  json: string,
  options: BackupOptions = {},
): Promise<RestoreBackupResult> {
  const document = parseBackupJson(json);
  const currentDataSnapshotted = await snapshotCurrentDataIfValid(
    database,
    options,
  );
  await replaceDatabaseData(database, document);
  return { currentDataSnapshotted };
}

export async function restoreLatestSnapshot(
  database: LocaledgerDatabase,
  options: BackupOptions = {},
): Promise<RestoreLatestSnapshotResult> {
  const snapshot = await database.backupSnapshots
    .orderBy("createdAt")
    .reverse()
    .first();
  if (!snapshot) {
    throw new Error("No backup snapshot is available");
  }

  const document = parseBackupJson(JSON.stringify(snapshot.document));
  const currentDataSnapshotted = await snapshotCurrentDataIfValid(
    database,
    options,
  );
  await replaceDatabaseData(database, document);
  return { snapshot, currentDataSnapshotted };
}
