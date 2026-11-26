import { z } from 'zod';

export const LOCAL_SCHEMA_VERSION = 1;

export const schemaMetadataSchema = z
  .object({
    key: z.literal('schema'),
    version: z.number().int().nonnegative(),
  })
  .strict();

export type SchemaMetadata = z.infer<typeof schemaMetadataSchema>;

export function assertSupportedSchemaVersion(version: unknown): number {
  const parsed = schemaMetadataSchema.shape.version.safeParse(version);
  if (!parsed.success) {
    throw new Error('IndexedDB schema version is invalid');
  }

  if (parsed.data > LOCAL_SCHEMA_VERSION) {
    throw new Error(
      `IndexedDB schema version ${parsed.data} is newer than supported version ${LOCAL_SCHEMA_VERSION}`,
    );
  }

  return parsed.data;
}
