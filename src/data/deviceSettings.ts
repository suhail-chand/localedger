import { z } from 'zod';

import type { LocaledgerDatabase } from '@/data/db';
import { uuidSchema, utcIsoSchema } from '@/domain/ids';

export const deviceSettingsSchema = z
  .object({
    key: z.literal('device'),
    deviceId: uuidSchema,
    storageMode: z.enum(['local', 'drive']),
    googleClientId: z.string().min(1).optional(),
    lastSync: utcIsoSchema.optional(),
    setupComplete: z.boolean(),
  })
  .strict();

export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;

export type PersistentStorageStatus =
  | 'checking'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface DeviceSettingsOptions {
  idFactory?: () => string;
}

export interface StoragePersistenceApi {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

function defaultIdFactory(): string {
  return globalThis.crypto.randomUUID();
}

export async function initializeDeviceSettings(
  database: LocaledgerDatabase,
  options: DeviceSettingsOptions = {},
): Promise<DeviceSettings> {
  const existing = await database.deviceSettings.get('device');
  if (existing) {
    return deviceSettingsSchema.parse(existing);
  }

  const settings = deviceSettingsSchema.parse({
    key: 'device',
    deviceId: (options.idFactory ?? defaultIdFactory)(),
    storageMode: 'local',
    setupComplete: false,
  });
  await database.deviceSettings.put(settings);
  return settings;
}

export async function getDeviceSettings(
  database: LocaledgerDatabase,
): Promise<DeviceSettings | undefined> {
  const settings = await database.deviceSettings.get('device');
  return settings ? deviceSettingsSchema.parse(settings) : undefined;
}

export async function updateDeviceSettings(
  database: LocaledgerDatabase,
  changes: Partial<
    Omit<DeviceSettings, 'key' | 'deviceId'>
  >,
): Promise<DeviceSettings> {
  const existing = await initializeDeviceSettings(database);
  const updated = deviceSettingsSchema.parse({
    ...existing,
    ...changes,
  });
  await database.deviceSettings.put(updated);
  return updated;
}

export async function requestPersistentStorage(
  storage: StoragePersistenceApi | undefined,
): Promise<Exclude<PersistentStorageStatus, 'checking'>> {
  if (!storage?.persist) {
    return 'unsupported';
  }

  try {
    if (storage.persisted) {
      const alreadyPersisted = await storage.persisted();
      if (alreadyPersisted) {
        return 'granted';
      }
    }
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'error';
  }
}
