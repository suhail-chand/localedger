import { z } from 'zod';

import type { BackupSnapshot, LocaledgerDatabase } from '@/data/db';
import {
  assertSupportedSchemaVersion,
  LOCAL_SCHEMA_VERSION,
  type SchemaMetadata,
} from '@/data/migrations';
import { toUtcIso, utcIsoSchema, uuidSchema } from '@/domain/ids';
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
    throw new Error('Backup contains duplicate record IDs');
  }
}

export async function exportBackup(
  database: LocaledgerDatabase,
  now = new Date(),
): Promise<string> {
  const document: BackupDocument = {
    schemaVersion: LOCAL_SCHEMA_VERSION,
    exportedAt: toUtcIso(now),
    data: {
      accounts: await readValidated(database.accounts.toArray(), accountSchema),
      categoryGroups: await readValidated(database.categoryGroups.toArray(), categoryGroupSchema),
      categories: await readValidated(database.categories.toArray(), categorySchema),
      payeeGroups: await readValidated(database.payeeGroups.toArray(), payeeGroupSchema),
      payees: await readValidated(database.payees.toArray(), payeeSchema),
      labels: await readValidated(database.labels.toArray(), labelSchema),
      transactions: await readValidated(database.transactions.toArray(), transactionSchema),
      scheduledTransactions: await readValidated(
        database.scheduledTransactions.toArray(),
        scheduledTransactionSchema,
      ),
      occurrenceRecords: await readValidated(
        database.occurrenceRecords.toArray(),
        occurrenceRecordSchema,
      ),
      settings: await readValidated(database.settings.toArray(), settingsSchema),
    },
  };

  const parsed = backupDocumentSchema.parse(document);
  validateUniqueIds(parsed);
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
    throw new Error('Backup JSON is invalid');
  }

  const document = backupDocumentSchema.parse(parsedJson);
  assertSupportedSchemaVersion(document.schemaVersion);
  validateUniqueIds(document);
  return document;
}

export async function snapshotExistingDatabase(
  database: LocaledgerDatabase,
  options: BackupOptions = {},
): Promise<BackupSnapshot> {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;
  const snapshotsToKeep = options.snapshotsToKeep ?? 5;

  if (!Number.isInteger(snapshotsToKeep) || snapshotsToKeep < 1) {
    throw new Error('snapshotsToKeep must be a positive integer');
  }

  const snapshotDocument = parseBackupJson(await exportBackup(database, now()));
  const snapshot: BackupSnapshot = {
    id: uuidSchema.parse(idFactory()),
    createdAt: toUtcIso(now()),
    document: snapshotDocument,
  };

  await database.backupSnapshots.put(snapshot);
  const snapshots = await database.backupSnapshots.orderBy('createdAt').reverse().toArray();
  if (snapshots.length > snapshotsToKeep) {
    await database.backupSnapshots.bulkDelete(
      snapshots.slice(snapshotsToKeep).map((item) => item.id),
    );
  }
  return snapshot;
}

async function replaceDatabaseData(
  database: LocaledgerDatabase,
  document: BackupDocument,
): Promise<void> {
  await database.transaction(
    'rw',
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
      await database.scheduledTransactions.bulkPut(document.data.scheduledTransactions);
      await database.occurrenceRecords.bulkPut(document.data.occurrenceRecords);
      await database.settings.bulkPut(document.data.settings);
      await database.metadata.put({
        key: 'schema',
        version: LOCAL_SCHEMA_VERSION,
      } satisfies SchemaMetadata);
    },
  );
}

export async function restoreBackup(
  database: LocaledgerDatabase,
  json: string,
  options: BackupOptions = {},
): Promise<void> {
  const document = parseBackupJson(json);
  await snapshotExistingDatabase(database, options);
  await replaceDatabaseData(database, document);
}

export async function restoreLatestSnapshot(
  database: LocaledgerDatabase,
): Promise<BackupSnapshot> {
  const snapshot = await database.backupSnapshots.orderBy('createdAt').reverse().first();
  if (!snapshot) {
    throw new Error('No backup snapshot is available');
  }

  const document = parseBackupJson(JSON.stringify(snapshot.document));
  await replaceDatabaseData(database, document);
  return snapshot;
}
