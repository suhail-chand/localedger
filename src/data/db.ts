import Dexie, { type Table } from 'dexie';

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
} from '@/domain/types';

import {
  assertSupportedSchemaVersion,
  LOCAL_SCHEMA_VERSION,
  schemaMetadataSchema,
  type SchemaMetadata,
} from '@/data/migrations';
import { seedDefaults } from '@/data/seed';

export class LocaledgerDatabase extends Dexie {
  metadata!: Table<SchemaMetadata, 'schema'>;
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
  deviceSettings!: Table<unknown, string>;

  constructor(name = 'localedger') {
    super(name);

    this.version(1).stores({
      metadata: '&key',
      accounts: '&id, updatedAt, deleted',
      categoryGroups: '&id, name, updatedAt, deleted',
      categories: '&id, name, groupId, kind, updatedAt, deleted',
      payeeGroups: '&id, updatedAt, deleted',
      payees: '&id, name, groupId, updatedAt, deleted',
      labels: '&id, name, updatedAt, deleted',
      transactions: '&id, occurredAt, createdAt, updatedAt, deleted',
      scheduledTransactions: '&id, status, startAt, updatedAt, deleted',
      occurrenceRecords: '&id, scheduleId, occurrenceAt, outcome, updatedAt, deleted',
      settings: '&id, updatedAt, deleted',
      deviceSettings: '&key',
    });
  }
}

export function createDatabase(name = 'localedger'): LocaledgerDatabase {
  return new LocaledgerDatabase(name);
}

export async function ensureDatabaseReady(database: LocaledgerDatabase): Promise<void> {
  await database.open();

  const existing = await database.metadata.get('schema');
  if (!existing) {
    await seedDefaults(database);
    return;
  }

  const metadata = schemaMetadataSchema.parse(existing);
  assertSupportedSchemaVersion(metadata.version);
  if (metadata.version !== LOCAL_SCHEMA_VERSION) {
    throw new Error(
      `IndexedDB schema version ${metadata.version} cannot be migrated to ${LOCAL_SCHEMA_VERSION}`,
    );
  }
}

export const db = createDatabase();
