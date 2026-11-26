import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";
import Dexie from "dexie";

import {
  assertSupportedSchemaVersion,
  LOCAL_SCHEMA_VERSION,
  schemaMetadataSchema,
} from "@/data/migrations";
import {
  createDatabase,
  ensureDatabaseReady,
  type LocaledgerDatabase,
} from "@/data/db";
import { seedDefaults } from "@/data/seed";
import { toPaise } from "@/domain/money";

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

describe("Localedger IndexedDB foundation", () => {
  it("upgrades a version-1 database to the current structure without losing records", async () => {
    const name = "localedger-v1-upgrade";
    const legacy = new Dexie(name);
    legacy.version(1).stores({
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

    await legacy.open();
    await legacy.table("metadata").put({
      key: "schema",
      version: 1,
    });
    await legacy.table("accounts").put({
      id: "40000000-0000-4000-8000-000000000001",
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: false,
      name: "Legacy Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(12500),
      currency: "INR",
      note: "Preserved during Dexie v1 to v2 upgrade",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    legacy.close();

    const database = createNamedDatabase(name);
    await ensureDatabaseReady(database);

    expect(
      await database.accounts.get("40000000-0000-4000-8000-000000000001"),
    ).toMatchObject({
      name: "Legacy Cash",
      startingBalance: toPaise(12500),
    });
    expect(await database.backupSnapshots.count()).toBe(0);
  });

  it("initializes a fresh database and seeds defaults", async () => {
    const database = createNamedDatabase("localedger-fresh");

    await ensureDatabaseReady(database);

    expect(await database.metadata.get("schema")).toEqual({
      key: "schema",
      version: LOCAL_SCHEMA_VERSION,
    });
    expect(await database.categoryGroups.count()).toBe(2);
    expect(await database.categories.count()).toBe(3);
    expect(await database.payees.count()).toBe(1);

    const other = await database.categories
      .where("name")
      .equals("Other")
      .first();
    expect(other).toMatchObject({
      builtIn: true,
      deleted: false,
    });

    const unspecified = await database.payees
      .where("name")
      .equals("Unspecified")
      .first();
    expect(unspecified).toMatchObject({
      builtIn: true,
      deleted: false,
    });
  });

  it("seeding is idempotent", async () => {
    const database = createNamedDatabase("localedger-idempotent");
    await ensureDatabaseReady(database);

    await seedDefaults(database, new Date("2027-01-01T00:00:00.000Z"));

    expect(await database.categoryGroups.count()).toBe(2);
    expect(await database.categories.count()).toBe(3);
    expect(await database.payees.count()).toBe(1);
  });

  it("uses the same seeded IDs when reseeded and across separate databases", async () => {
    const first = createNamedDatabase("localedger-seed-stable-first");
    const second = createNamedDatabase("localedger-seed-stable-second");
    await ensureDatabaseReady(first);
    await seedDefaults(first, new Date("2027-01-01T00:00:00.000Z"));
    await ensureDatabaseReady(second);

    const readIds = async (database: LocaledgerDatabase) => ({
      groups: (await database.categoryGroups.orderBy("id").toArray()).map(
        ({ id }) => id,
      ),
      categories: (await database.categories.orderBy("id").toArray()).map(
        ({ id }) => id,
      ),
      payees: (await database.payees.orderBy("id").toArray()).map(
        ({ id }) => id,
      ),
    });

    expect(await readIds(first)).toEqual(await readIds(second));
    expect(await readIds(first)).toEqual({
      groups: [
        "10000000-0000-4000-8000-000000000001",
        "10000000-0000-4000-8000-000000000002",
      ],
      categories: [
        "20000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000002",
        "20000000-0000-4000-8000-000000000003",
      ],
      payees: ["30000000-0000-4000-8000-000000000001"],
    });
  });

  it("validates a previous-version metadata fixture", async () => {
    const fixture = { key: "schema" as const, version: 1 };

    expect(schemaMetadataSchema.parse(fixture)).toEqual(fixture);
    expect(assertSupportedSchemaVersion(fixture.version)).toBe(1);
  });

  it("migrates a version-0 metadata fixture without losing records", async () => {
    const fixture = { key: "schema" as const, version: 0 };
    expect(assertSupportedSchemaVersion(fixture.version)).toBe(0);

    const database = createNamedDatabase("localedger-v0-migration");
    await database.open();
    await database.metadata.put(fixture);
    await database.accounts.put({
      id: "40000000-0000-4000-8000-000000000001",
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
      deleted: false,
      name: "Legacy Cash",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(12500),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    await ensureDatabaseReady(database);

    expect(await database.metadata.get("schema")).toEqual({
      key: "schema",
      version: LOCAL_SCHEMA_VERSION,
    });
    expect(
      await database.accounts.get("40000000-0000-4000-8000-000000000001"),
    ).toMatchObject({ name: "Legacy Cash", startingBalance: 12500 });
  });

  it("refuses metadata from a newer schema", async () => {
    expect(() =>
      assertSupportedSchemaVersion(LOCAL_SCHEMA_VERSION + 1),
    ).toThrow("is newer than supported version");
  });

  it("rejects corrupt metadata instead of silently fixing it", () => {
    expect(() => assertSupportedSchemaVersion(-1)).toThrow(
      "IndexedDB schema version is invalid",
    );
  });
});
