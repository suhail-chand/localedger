import Dexie, { type Table } from "dexie";

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

import {
  assertSupportedSchemaVersion,
  LOCAL_SCHEMA_VERSION,
  schemaMetadataSchema,
  type SchemaMetadata,
} from "@/data/migrations";
import { migrateCategoryFallbacks, seedDefaults } from "@/data/seed";
import type { DeviceSettings } from "@/data/deviceSettings";
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

export interface BackupSnapshot {
  id: string;
  createdAt: string;
  document: {
    schemaVersion: number;
    exportedAt: string;
    data: {
      accounts: Account[];
      categoryGroups: CategoryGroup[];
      categories: Category[];
      payeeGroups: PayeeGroup[];
      payees: Payee[];
      labels: Label[];
      transactions: Transaction[];
      scheduledTransactions: ScheduledTransaction[];
      occurrenceRecords: OccurrenceRecord[];
      settings: Settings[];
    };
  };
}

export class LocaledgerDatabase extends Dexie {
  metadata!: Table<SchemaMetadata, "schema">;
  accounts!: Table<Account, string>;
  categoryGroups!: Table<CategoryGroup, string>;
  categories!: Table<Category, string>;
  payeeGroups!: Table<PayeeGroup, string>;
  payees!: Table<Payee, string>;
  labels!: Table<Label, string>;
  transactions!: Table<Transaction, string>;
  scheduledTransactions!: Table<ScheduledTransaction, string>;
  occurrenceRecords!: Table<OccurrenceRecord, string>;
  settings!: Table<Settings, string>;
  deviceSettings!: Table<DeviceSettings, string>;
  backupSnapshots!: Table<BackupSnapshot, string>;

  constructor(name = "localedger") {
    super(name);

    this.version(1).stores({
      metadata: "&key",
      accounts: "&id, updatedAt, deleted",
      categoryGroups: "&id, name, updatedAt, deleted",
      categories: "&id, name, groupId, kind, updatedAt, deleted",
      payeeGroups: "&id, updatedAt, deleted",
      payees: "&id, name, groupId, updatedAt, deleted",
      labels: "&id, name, updatedAt, deleted",
      transactions: "&id, occurredAt, createdAt, updatedAt, deleted",
      scheduledTransactions: "&id, status, startAt, updatedAt, deleted",
      occurrenceRecords:
        "&id, scheduleId, occurrenceAt, outcome, updatedAt, deleted",
      settings: "&id, updatedAt, deleted",
      deviceSettings: "&key",
    });

    this.version(2).stores({
      backupSnapshots: "&id, createdAt",
    });
  }
}

export function createDatabase(name = "localedger"): LocaledgerDatabase {
  return new LocaledgerDatabase(name);
}

export async function ensureDatabaseReady(
  database: LocaledgerDatabase,
): Promise<void> {
  await database.open();

  const existing = await database.metadata.get("schema");
  if (!existing) {
    await seedDefaults(database);
    return;
  }

  const metadata = schemaMetadataSchema.parse(existing);
  assertSupportedSchemaVersion(metadata.version);
  if (metadata.version === 0) {
    await migrateLegacySchema(database);
    await migrateCategoryFallbacks(database);
    return;
  }
  if (metadata.version === 1) {
    await migrateCategoryFallbacks(database);
    return;
  }
  if (metadata.version !== LOCAL_SCHEMA_VERSION) {
    throw new Error(
      `IndexedDB schema version ${metadata.version} cannot be migrated to ${LOCAL_SCHEMA_VERSION}`,
    );
  }
}

async function migrateLegacySchema(
  database: LocaledgerDatabase,
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
      for (const record of await database.accounts.toArray())
        accountSchema.parse(record);
      for (const record of await database.categoryGroups.toArray())
        categoryGroupSchema.parse(record);
      for (const record of await database.categories.toArray())
        categorySchema.parse(record);
      for (const record of await database.payeeGroups.toArray())
        payeeGroupSchema.parse(record);
      for (const record of await database.payees.toArray())
        payeeSchema.parse(record);
      for (const record of await database.labels.toArray())
        labelSchema.parse(record);
      for (const record of await database.transactions.toArray())
        transactionSchema.parse(record);
      for (const record of await database.scheduledTransactions.toArray())
        scheduledTransactionSchema.parse(record);
      for (const record of await database.occurrenceRecords.toArray())
        occurrenceRecordSchema.parse(record);
      for (const record of await database.settings.toArray())
        settingsSchema.parse(record);

      await database.metadata.put({
        key: "schema",
        version: 1,
      } satisfies SchemaMetadata);
    },
  );
}

export const db = createDatabase();
