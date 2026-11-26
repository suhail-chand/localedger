import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDatabase,
  ensureDatabaseReady,
  type LocaledgerDatabase,
} from "@/data/db";
import {
  getDeviceSettings,
  initializeDeviceSettings,
  requestPersistentStorage,
  updateDeviceSettings,
} from "@/data/deviceSettings";

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

describe("device settings", () => {
  it("creates device-local settings once and preserves the device ID", async () => {
    const database = await setupDatabase("device-settings-create");
    const first = await initializeDeviceSettings(database, {
      idFactory: () => "40000000-0000-4000-8000-000000000001",
    });
    const second = await initializeDeviceSettings(database);

    expect(first).toEqual({
      key: "device",
      deviceId: "40000000-0000-4000-8000-000000000001",
      storageMode: "local",
      setupComplete: false,
    });
    expect(second).toEqual(first);
  });

  it("updates and validates device-local settings", async () => {
    const database = await setupDatabase("device-settings-update");
    await initializeDeviceSettings(database, {
      idFactory: () => "40000000-0000-4000-8000-000000000002",
    });

    const updated = await updateDeviceSettings(database, {
      storageMode: "drive",
      googleClientId: "localedger.apps.googleusercontent.com",
      lastSync: "2026-11-26T18:00:00.000Z",
      setupComplete: true,
    });

    expect(await getDeviceSettings(database)).toEqual(updated);
  });

  it("rejects corrupt device settings instead of silently fixing them", async () => {
    const database = await setupDatabase("device-settings-corrupt");
    await database.deviceSettings.put({
      key: "device",
      deviceId: "not-a-uuid",
      storageMode: "local",
      setupComplete: false,
    } as never);

    await expect(getDeviceSettings(database)).rejects.toThrow();
  });

  it("reports granted persistent storage", async () => {
    await expect(
      requestPersistentStorage({
        persisted: async () => false,
        persist: async () => true,
      }),
    ).resolves.toBe("granted");
  });

  it("reports denied persistent storage", async () => {
    await expect(
      requestPersistentStorage({
        persisted: async () => false,
        persist: async () => false,
      }),
    ).resolves.toBe("denied");
  });

  it("reports unsupported persistent storage", async () => {
    await expect(requestPersistentStorage(undefined)).resolves.toBe(
      "unsupported",
    );
  });

  it("reports persistence errors", async () => {
    await expect(
      requestPersistentStorage({
        persist: async () => {
          throw new Error("storage unavailable");
        },
      }),
    ).resolves.toBe("error");
  });
});
