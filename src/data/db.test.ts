import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertSupportedSchemaVersion,
  LOCAL_SCHEMA_VERSION,
  schemaMetadataSchema,
} from '@/data/migrations';
import { createDatabase, ensureDatabaseReady, type LocaledgerDatabase } from '@/data/db';
import { seedDefaults } from '@/data/seed';

const databases: LocaledgerDatabase[] = [];

function createNamedDatabase(name: string) {
  const database = createDatabase(name);
  databases.push(database);
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

describe('Localedger IndexedDB foundation', () => {
  it('initializes a fresh database and seeds defaults', async () => {
    const database = createNamedDatabase('localedger-fresh');

    await ensureDatabaseReady(database);

    expect(await database.metadata.get('schema')).toEqual({
      key: 'schema',
      version: LOCAL_SCHEMA_VERSION,
    });
    expect(await database.categoryGroups.count()).toBe(2);
    expect(await database.categories.count()).toBe(3);
    expect(await database.payees.count()).toBe(1);

    const other = await database.categories
      .where('name')
      .equals('Other')
      .first();
    expect(other).toMatchObject({
      builtIn: true,
      deleted: false,
    });

    const unspecified = await database.payees
      .where('name')
      .equals('Unspecified')
      .first();
    expect(unspecified).toMatchObject({
      builtIn: true,
      deleted: false,
    });
  });

  it('seeding is idempotent', async () => {
    const database = createNamedDatabase('localedger-idempotent');
    await ensureDatabaseReady(database);

    await seedDefaults(database, new Date('2027-01-01T00:00:00.000Z'));

    expect(await database.categoryGroups.count()).toBe(2);
    expect(await database.categories.count()).toBe(3);
    expect(await database.payees.count()).toBe(1);
  });

  it('validates a previous-version metadata fixture', async () => {
    const fixture = { key: 'schema' as const, version: 1 };

    expect(schemaMetadataSchema.parse(fixture)).toEqual(fixture);
    expect(assertSupportedSchemaVersion(fixture.version)).toBe(1);
  });

  it('refuses metadata from a newer schema', async () => {
    expect(() => assertSupportedSchemaVersion(LOCAL_SCHEMA_VERSION + 1)).toThrow(
      'is newer than supported version',
    );
  });

  it('rejects corrupt metadata instead of silently fixing it', () => {
    expect(() => assertSupportedSchemaVersion(-1)).toThrow(
      'IndexedDB schema version is invalid',
    );
  });
});
