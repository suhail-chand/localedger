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
  expenseOtherGroup: "10000000-0000-4000-8000-000000000003",
  incomeOtherGroup: "10000000-0000-4000-8000-000000000004",
  other: "20000000-0000-4000-8000-000000000001",
  unspecified: "30000000-0000-4000-8000-000000000001",
  interest: "20000000-0000-4000-8000-000000000002",
  tax: "20000000-0000-4000-8000-000000000003",
  incomeOther: "20000000-0000-4000-8000-000000000004",
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
        {
          id: SEED_IDS.expenseOtherGroup,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Other",
          kind: "expense",
        },
        {
          id: SEED_IDS.incomeOtherGroup,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Other",
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
          groupId: SEED_IDS.expenseOtherGroup,
          kind: "expense",
          builtIn: true,
        },
        {
          id: SEED_IDS.incomeOther,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Other",
          icon: "ellipsis",
          groupId: SEED_IDS.incomeOtherGroup,
          kind: "income",
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

export async function migrateCategoryFallbacks(
  database: LocaledgerDatabase,
  now = new Date(),
): Promise<void> {
  const timestamp = seedTimestamp(now);
  await database.transaction(
    "rw",
    [database.metadata, database.categoryGroups, database.categories],
    async () => {
      const metadata = await database.metadata.get("schema");
      if (!metadata || metadata.version !== 1) {
        throw new Error("Cannot migrate category fallbacks from this schema");
      }

      const expenseOther = categorySchema.parse(
        await database.categories.get(SEED_IDS.other),
      );
      if (
        expenseOther.deleted ||
        expenseOther.builtIn !== true ||
        expenseOther.kind !== "expense"
      ) {
        throw new Error(
          "Built-in Expense Other category is missing or invalid",
        );
      }

      const groups: CategoryGroup[] = [
        {
          id: SEED_IDS.expenseOtherGroup,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Other",
          kind: "expense",
        },
        {
          id: SEED_IDS.incomeOtherGroup,
          createdAt: timestamp,
          updatedAt: timestamp,
          deleted: false,
          name: "Other",
          kind: "income",
        },
      ];
      for (const group of groups) {
        const parsedGroup = categoryGroupSchema.parse(group);
        const existing = await database.categoryGroups.get(group.id);
        if (existing) {
          const parsed = categoryGroupSchema.parse(existing);
          if (
            parsed.deleted ||
            parsed.name !== group.name ||
            parsed.kind !== group.kind
          ) {
            throw new Error(`Built-in ${group.kind} Other group is invalid`);
          }
        } else {
          await database.categoryGroups.add(parsedGroup);
        }
      }

      const incomeOther = await database.categories.get(SEED_IDS.incomeOther);
      if (incomeOther) {
        const parsed = categorySchema.parse(incomeOther);
        if (
          parsed.deleted ||
          parsed.builtIn !== true ||
          parsed.name !== "Other" ||
          parsed.kind !== "income" ||
          parsed.groupId !== SEED_IDS.incomeOtherGroup
        ) {
          throw new Error("Built-in Income Other category is invalid");
        }
      } else {
        await database.categories.add(
          categorySchema.parse({
            id: SEED_IDS.incomeOther,
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: false,
            name: "Other",
            icon: "ellipsis",
            groupId: SEED_IDS.incomeOtherGroup,
            kind: "income",
            builtIn: true,
          }),
        );
      }

      if (expenseOther.groupId !== SEED_IDS.expenseOtherGroup) {
        await database.categories.put(
          categorySchema.parse({
            ...expenseOther,
            groupId: SEED_IDS.expenseOtherGroup,
            updatedAt: timestamp,
          }),
        );
      }
      await database.metadata.put({
        key: "schema",
        version: LOCAL_SCHEMA_VERSION,
      });
    },
  );
}
