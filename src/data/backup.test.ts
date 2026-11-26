import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  exportBackup,
  parseBackupJson,
  restoreBackup,
  restoreLatestSnapshot,
  snapshotExistingDatabase,
} from '@/data/backup';
import { createDatabase, ensureDatabaseReady, type LocaledgerDatabase } from '@/data/db';
import { createAccountRepository } from '@/data/repositories';
import { LOCAL_SCHEMA_VERSION } from '@/data/migrations';
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

describe('JSON backup and restore', () => {
  it('round-trips all application records through an exported backup', async () => {
    const database = await setupDatabase('backup-round-trip');
    const accounts = createAccountRepository(database, {
      now: () => new Date('2026-11-26T10:00:00.000Z'),
      idFactory: () => '40000000-0000-4000-8000-000000000001',
    });
    await accounts.create({
      name: 'Cash',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(12500),
      currency: 'INR',
      note: 'Primary wallet',
      hideFromTransactions: false,
      hideFromReports: false,
    });

    const json = await exportBackup(database, new Date('2026-11-26T12:00:00.000Z'));
    const exported = parseBackupJson(json);

    expect(exported.schemaVersion).toBe(LOCAL_SCHEMA_VERSION);
    expect(exported.data.accounts).toHaveLength(1);
    expect(exported.data.accounts[0]?.name).toBe('Cash');
    expect(exported.data.categoryGroups).toHaveLength(2);

    await accounts.softDelete('40000000-0000-4000-8000-000000000001');
    await restoreBackup(database, json, {
      now: () => new Date('2026-11-26T13:00:00.000Z'),
      idFactory: () => '40000000-0000-4000-8000-000000000099',
    });

    expect(await accounts.get('40000000-0000-4000-8000-000000000001')).toMatchObject({
      name: 'Cash',
      startingBalance: toPaise(12500),
      deleted: false,
    });
  });

  it('rejects invalid JSON and corrupt backup data', async () => {
    const database = await setupDatabase('backup-invalid');

    await expect(restoreBackup(database, '{not json')).rejects.toThrow('Backup JSON is invalid');
    await expect(
      restoreBackup(
        database,
        JSON.stringify({
          schemaVersion: LOCAL_SCHEMA_VERSION,
          exportedAt: '2026-11-26T12:00:00.000Z',
          data: { accounts: [{ id: 'bad' }] },
        }),
      ),
    ).rejects.toThrow();

    expect(await database.backupSnapshots.count()).toBe(0);
  });

  it('rejects a backup from a newer schema before creating a snapshot', async () => {
    const database = await setupDatabase('backup-newer');
    const json = await exportBackup(database, new Date('2026-11-26T12:00:00.000Z'));
    const parsed = parseBackupJson(json);

    await expect(
      restoreBackup(
        database,
        JSON.stringify({
          ...parsed,
          schemaVersion: LOCAL_SCHEMA_VERSION + 1,
        }),
      ),
    ).rejects.toThrow('is newer than supported version');
    expect(await database.backupSnapshots.count()).toBe(0);
  });

  it('rejects duplicate IDs', async () => {
    const database = await setupDatabase('backup-duplicates');
    const accounts = createAccountRepository(database, {
      now: () => new Date('2026-11-26T10:00:00.000Z'),
      idFactory: () => '40000000-0000-4000-8000-000000000001',
    });
    await accounts.create({
      name: 'Duplicate',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(0),
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const json = await exportBackup(database, new Date('2026-11-26T12:00:00.000Z'));
    const parsed = parseBackupJson(json);

    const first = parsed.data.accounts[0];
    if (!first) throw new Error('Backup account missing');
    parsed.data.accounts.push(first);

    expect(() => parseBackupJson(JSON.stringify(parsed))).toThrow(
      'Backup contains duplicate record IDs',
    );
  });

  it('keeps a recoverable snapshot and restores it after replacement', async () => {
    const database = await setupDatabase('backup-snapshot');
    const accounts = createAccountRepository(database, {
      now: () => new Date('2026-11-26T10:00:00.000Z'),
      idFactory: () => '40000000-0000-4000-8000-000000000001',
    });
    await accounts.create({
      name: 'Original',
      type: 'cash',
      openingDate: '2026-11-26T00:00:00.000Z',
      startingBalance: toPaise(1000),
      currency: 'INR',
      note: '',
      hideFromTransactions: false,
      hideFromReports: false,
    });

    await snapshotExistingDatabase(database, {
      now: () => new Date('2026-11-26T12:00:00.000Z'),
      idFactory: () => '40000000-0000-4000-8000-000000000099',
    });
    await database.accounts.clear();

    const restored = await restoreLatestSnapshot(database);

    expect(restored.id).toBe('40000000-0000-4000-8000-000000000099');
    expect(await accounts.get('40000000-0000-4000-8000-000000000001')).toMatchObject({
      name: 'Original',
      startingBalance: toPaise(1000),
    });
  });
});
