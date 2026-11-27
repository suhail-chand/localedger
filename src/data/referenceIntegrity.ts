import type { LocaledgerDatabase } from "@/data/db";
import { scanTransactions } from "@/data/transactionScan";
import {
  accountSchema,
  categoryGroupSchema,
  categorySchema,
  labelSchema,
  payeeSchema,
  scheduledTransactionSchema,
  transactionSchema,
} from "@/domain/schemas";
import type {
  OccurrenceRecord,
  ScheduledTransaction,
  Transaction,
} from "@/domain/types";

export class TransactionReferenceUnavailableError extends Error {
  constructor(kind: "account" | "category" | "payee" | "label", id: string) {
    super(`Transaction references missing or deleted ${kind} ${id}`);
    this.name = "TransactionReferenceUnavailableError";
  }
}

export class TransactionAccountUnavailableError extends Error {
  constructor(accountId: string) {
    super(`Transaction references missing or deleted account ${accountId}`);
    this.name = "TransactionAccountUnavailableError";
  }
}

export class AccountUsageCorruptionError extends Error {
  constructor() {
    super("Corrupt transaction data prevents checking account usage");
    this.name = "AccountUsageCorruptionError";
  }
}

export class OccurrenceReferenceUnavailableError extends Error {
  constructor(kind: "schedule" | "transaction", id: string) {
    super(`Occurrence references missing or deleted ${kind} ${id}`);
    this.name = "OccurrenceReferenceUnavailableError";
  }
}

export class CategoryKindMismatchError extends Error {
  constructor(categoryId: string, expectedKind: "expense" | "income") {
    super(
      `Category ${categoryId} is not valid for ${expectedKind} transactions`,
    );
    this.name = "CategoryKindMismatchError";
  }
}

export class CategoryGroupKindMismatchError extends Error {
  constructor(groupId: string, categoryKind: "expense" | "income") {
    super(
      `Category group ${groupId} is not valid for ${categoryKind} categories`,
    );
    this.name = "CategoryGroupKindMismatchError";
  }
}

export class GroupReferenceUnavailableError extends Error {
  constructor(kind: "category" | "payee", id: string) {
    super(
      `${kind === "category" ? "Category" : "Payee"} references missing or deleted group ${id}`,
    );
    this.name = "GroupReferenceUnavailableError";
  }
}

async function assertActiveRecord(
  database: LocaledgerDatabase,
  table: "accounts" | "categories" | "payees" | "labels",
  id: string,
  kind: "account" | "category" | "payee" | "label",
): Promise<void> {
  const record = await database[table].get(id);
  const parsed =
    table === "accounts"
      ? accountSchema.safeParse(record)
      : table === "categories"
        ? categorySchema.safeParse(record)
        : table === "payees"
          ? payeeSchema.safeParse(record)
          : labelSchema.safeParse(record);

  if (!parsed.success || parsed.data.deleted) {
    if (kind === "account") {
      throw new TransactionAccountUnavailableError(id);
    }
    throw new TransactionReferenceUnavailableError(kind, id);
  }
}

export async function assertTransactionReferencesAvailable(
  database: LocaledgerDatabase,
  transaction: Transaction,
): Promise<void> {
  const accountIds = new Set<string>();
  for (const split of transaction.splits) {
    if (split.type === "transfer") {
      accountIds.add(split.fromAccountId);
      accountIds.add(split.toAccountId);
    } else {
      accountIds.add(split.accountId);
      if (split.categoryId) {
        await assertActiveRecord(
          database,
          "categories",
          split.categoryId,
          "category",
        );
        await assertCategoryKindAvailable(
          database,
          split.categoryId,
          split.type,
        );
      }
      if (split.payeeId) {
        await assertActiveRecord(database, "payees", split.payeeId, "payee");
      }
    }
  }
  for (const accountId of accountIds) {
    await assertActiveRecord(database, "accounts", accountId, "account");
  }
  for (const labelId of transaction.labelIds) {
    await assertActiveRecord(database, "labels", labelId, "label");
  }
}

export async function assertScheduleReferencesAvailable(
  database: LocaledgerDatabase,
  schedule: ScheduledTransaction,
): Promise<void> {
  await assertTransactionReferencesAvailable(database, {
    ...schedule.template,
    id: schedule.id,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
    deleted: schedule.deleted,
  });
}

export async function assertCategoryGroupAvailable(
  database: LocaledgerDatabase,
  groupId: string,
  categoryKind?: "expense" | "income",
): Promise<void> {
  const parsed = categoryGroupSchema.safeParse(
    await database.categoryGroups.get(groupId),
  );
  if (!parsed.success || parsed.data.deleted) {
    throw new GroupReferenceUnavailableError("category", groupId);
  }
  if (categoryKind && parsed.data.kind !== categoryKind) {
    throw new CategoryGroupKindMismatchError(groupId, categoryKind);
  }
}

export async function assertCategoryKindAvailable(
  database: LocaledgerDatabase,
  categoryId: string,
  splitKind: "expense" | "income",
): Promise<void> {
  const parsed = categorySchema.safeParse(
    await database.categories.get(categoryId),
  );
  if (!parsed.success || parsed.data.deleted) {
    throw new TransactionReferenceUnavailableError("category", categoryId);
  }
  if (parsed.data.kind !== splitKind) {
    throw new CategoryKindMismatchError(categoryId, splitKind);
  }
}

export async function assertPayeeGroupAvailable(
  database: LocaledgerDatabase,
  groupId: string | undefined,
): Promise<void> {
  if (!groupId) {
    return;
  }
  const group = await database.payeeGroups.get(groupId);
  if (!group || group.deleted) {
    throw new GroupReferenceUnavailableError("payee", groupId);
  }
}

export async function assertOccurrenceReferencesAvailable(
  database: LocaledgerDatabase,
  occurrence: OccurrenceRecord,
): Promise<void> {
  const schedule = await database.scheduledTransactions.get(
    occurrence.scheduleId,
  );
  const parsedSchedule = scheduledTransactionSchema.safeParse(schedule);
  if (!parsedSchedule.success || parsedSchedule.data.deleted) {
    throw new OccurrenceReferenceUnavailableError(
      "schedule",
      occurrence.scheduleId,
    );
  }
  if (occurrence.transactionId) {
    const transaction = await database.transactions.get(
      occurrence.transactionId,
    );
    const parsedTransaction = transactionSchema.safeParse(transaction);
    if (!parsedTransaction.success || parsedTransaction.data.deleted) {
      throw new OccurrenceReferenceUnavailableError(
        "transaction",
        occurrence.transactionId,
      );
    }
  }
}

export async function assertAccountNotInUse(
  database: LocaledgerDatabase,
  accountId: string,
  options: { excludeDeletedRecords?: boolean } = {},
): Promise<boolean> {
  let inUse = false;
  await scanTransactions(
    database,
    (transaction) => {
      if (options.excludeDeletedRecords && transaction.deleted) {
        return;
      }
      if (
        transaction.splits.some((split) =>
          split.type === "transfer"
            ? split.fromAccountId === accountId ||
              split.toAccountId === accountId
            : split.accountId === accountId,
        )
      ) {
        inUse = true;
      }
    },
    {
      corruptionError: () => new AccountUsageCorruptionError(),
      shouldEarlyExit: () => inUse,
    },
  );
  if (inUse) {
    return true;
  }

  for (const record of await database.scheduledTransactions.toArray()) {
    const schedule = scheduledTransactionSchema.parse(record);
    if (options.excludeDeletedRecords && schedule.deleted) {
      continue;
    }
    if (
      schedule.template.splits.some((split) =>
        split.type === "transfer"
          ? split.fromAccountId === accountId || split.toAccountId === accountId
          : split.accountId === accountId,
      )
    ) {
      return true;
    }
  }
  return false;
}
