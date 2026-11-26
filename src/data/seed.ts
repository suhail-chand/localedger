import type { LocaledgerDatabase } from "@/data/db";
import { toUtcIso } from "@/domain/ids";
import { LOCAL_SCHEMA_VERSION } from "@/data/migrations";
import type { Category, CategoryGroup, Payee } from "@/domain/types";
import {
  categoryGroupSchema,
  categorySchema,
  payeeSchema,
} from "@/domain/schemas";

export const SEED_IDS = {
  expenseGroup: "10000000-0000-4000-8000-000000000001",
  incomeGroup: "10000000-0000-4000-8000-000000000002",
  other: "20000000-0000-4000-8000-000000000001",
  unspecified: "30000000-0000-4000-8000-000000000001",
  interest: "20000000-0000-4000-8000-000000000002",
  tax: "20000000-0000-4000-8000-000000000003",
} as const;

function seedTimestamp(now: Date): string {
  return toUtcIso(now);
}

export async function seedDefaults(
  database: LocaledgerDatabase,
  now = new Date(),
): Promise<void> {
  const timestamp = seedTimestamp(now);

  await database.transaction(
    "rw",
    [
      database.metadata,
      database.categoryGroups,
      database.categories,
      database.payees,
    ],
    async () => {
      const existingMetadata = await database.metadata.get("schema");
      if (existingMetadata) {
        return;
      }

      const groups: CategoryGroup[] = [
        {
          id: SEED_IDS.expenseGroup,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Expenses",
          kind: "expense",
        },
        {
          id: SEED_IDS.incomeGroup,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Income",
          kind: "income",
        },
      ];

      const categories: Category[] = [
        {
          id: SEED_IDS.other,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Other",
          icon: "ellipsis",
          groupId: SEED_IDS.expenseGroup,
          kind: "expense",
          builtIn: true,
        },
        {
          id: SEED_IDS.interest,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Interest",
          icon: "percent",
          groupId: SEED_IDS.expenseGroup,
          kind: "expense",
        },
        {
          id: SEED_IDS.tax,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Tax",
          icon: "receipt",
          groupId: SEED_IDS.expenseGroup,
          kind: "expense",
        },
      ];

      const unspecified: Payee = {
        id: SEED_IDS.unspecified,
        createdAt: timestamp,
        updatedAt: timestamp,
        deleted: false,
        name: "Unspecified",
        builtIn: true,
      };

      for (const group of groups) {
        categoryGroupSchema.parse(group);
      }
      for (const category of categories) {
        categorySchema.parse(category);
      }
      payeeSchema.parse(unspecified);

      await database.categoryGroups.bulkPut(groups);
      await database.categories.bulkPut(categories);
      await database.payees.put(unspecified);
      await database.metadata.put({
        key: "schema",
        version: LOCAL_SCHEMA_VERSION,
      });
    },
  );
}
