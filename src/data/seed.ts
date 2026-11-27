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

type StarterCategoryDefinition = {
  name: string;
  icon: string;
};

type StarterGroupDefinition = {
  id?: string;
  name: string;
  kind: "expense" | "income";
  categories: StarterCategoryDefinition[];
};

const STARTER_GROUPS: StarterGroupDefinition[] = [
  // EXPENSE
  {
    name: "Housing",
    kind: "expense",
    categories: [
      { name: "Rent", icon: "home" },
      { name: "Home Maintenance", icon: "hammer" },
      { name: "Home Supplies", icon: "lamp" },
      { name: "Furniture", icon: "armchair" },
    ],
  },
  {
    name: "Food & Dining",
    kind: "expense",
    categories: [
      { name: "Groceries", icon: "basket" },
      { name: "Restaurants", icon: "utensils" },
      { name: "Food Delivery", icon: "bike" },
      { name: "Snacks", icon: "cookie" },
    ],
  },
  {
    name: "Transportation",
    kind: "expense",
    categories: [
      { name: "Fuel", icon: "fuel" },
      { name: "Public Transport", icon: "bus" },
      { name: "Taxi", icon: "car-taxi-front" },
      { name: "Vehicle Maintenance", icon: "wrench" },
    ],
  },
  {
    name: "Bills & Utilities",
    kind: "expense",
    categories: [
      { name: "Electricity", icon: "zap" },
      { name: "Water", icon: "droplets" },
      { name: "Internet", icon: "wifi" },
      { name: "Mobile", icon: "smartphone" },
      { name: "Gas", icon: "flame" },
    ],
  },
  {
    name: "Health & Fitness",
    kind: "expense",
    categories: [
      { name: "Medical", icon: "hospital" },
      { name: "Pharmacy", icon: "pill" },
      { name: "Doctor", icon: "stethoscope" },
      { name: "Fitness", icon: "dumbbell" },
    ],
  },
  {
    name: "Shopping",
    kind: "expense",
    categories: [
      { name: "Essentials", icon: "shopping-bag" },
      { name: "Clothing", icon: "shirt" },
      { name: "Accessories", icon: "watch" },
      { name: "Electronics", icon: "monitor-pc" },
      { name: "Digital", icon: "monitor-cloud" },
    ],
  },
  {
    name: "Personal & Family",
    kind: "expense",
    categories: [
      { name: "Personal Care", icon: "user-round" },
      { name: "Childcare", icon: "baby" },
      { name: "Pets", icon: "paw-print" },
      { name: "Allowances", icon: "users" },
    ],
  },
  {
    name: "Education",
    kind: "expense",
    categories: [
      { name: "Tuition", icon: "education" },
      { name: "Books", icon: "book" },
      { name: "Courses", icon: "presentation" },
    ],
  },
  {
    name: "Entertainment",
    kind: "expense",
    categories: [
      { name: "Movies", icon: "clapperboard" },
      { name: "Games", icon: "gamepad" },
      { name: "Subscriptions", icon: "monitor-play" },
      { name: "Hobbies", icon: "palette" },
      { name: "Activities", icon: "ball-wave" },
    ],
  },
  {
    name: "Travel",
    kind: "expense",
    categories: [
      { name: "Flights", icon: "plane" },
      { name: "Hotels", icon: "hotel" },
      { name: "Local Travel", icon: "map" },
      { name: "Vacation", icon: "palmtree" },
    ],
  },
  {
    name: "Finance & Taxes",
    kind: "expense",
    categories: [
      { name: "Bank Charges", icon: "landmark" },
      { name: "Loan Payments", icon: "hand-coins" },
      { name: "Interest", icon: "percent" },
      { name: "Tax", icon: "receipt" },
      { name: "Insurance", icon: "shield-check" },
    ],
  },
  {
    name: "Gifts & Donations",
    kind: "expense",
    categories: [
      { name: "Gifts", icon: "gift" },
      { name: "Charity", icon: "heart-handshake" },
      { name: "Religious Donations", icon: "hand-heart" },
    ],
  },

  // INCOME
  {
    name: "Employment",
    kind: "income",
    categories: [
      { name: "Salary", icon: "briefcase-business" },
      { name: "Bonus", icon: "award" },
      { name: "Allowances", icon: "wallet" },
      { name: "Freelance", icon: "laptop" },
    ],
  },
  {
    name: "Business",
    kind: "income",
    categories: [
      { name: "Business Income", icon: "store" },
      { name: "Consulting", icon: "handshake" },
      { name: "Sales", icon: "receipt" },
    ],
  },
  {
    name: "Investments",
    kind: "income",
    categories: [
      { name: "Interest Earned", icon: "percent" },
      { name: "Dividends", icon: "chart" },
      { name: "Capital Gains", icon: "trending-up" },
    ],
  },
  {
    name: "Property",
    kind: "income",
    categories: [
      { name: "Rental Income", icon: "houses" },
      { name: "Property Sale", icon: "house-arrow-right" },
    ],
  },
  {
    id: SEED_IDS.incomeOtherGroup,
    name: "Other",
    kind: "income",
    categories: [
      { name: "Cashback", icon: "badge-percent" },
      { name: "Refunds", icon: "undo" },
      { name: "Rewards", icon: "trophy" },
      { name: "Gifts", icon: "gift" },
    ],
  },
];

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

      const groups: CategoryGroup[] = [];
      const categories: Category[] = [];

      for (const definition of STARTER_GROUPS) {
        let groupId;

        if (definition?.id) {
          groupId = definition.id;
        } else {
          groupId = crypto.randomUUID();

          groups.push({
            id: groupId,
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: false,
            name: definition.name,
            kind: definition.kind,
          });
        }

        for (const category of definition.categories) {
          categories.push({
            id: crypto.randomUUID(),
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: false,
            name: category.name,
            icon: category.icon,
            groupId,
            kind: definition.kind,
          });
        }
      }

      // Preserve the existing built-in Other groups and categories.
      groups.push(
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
      );

      categories.push(
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
      );

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
