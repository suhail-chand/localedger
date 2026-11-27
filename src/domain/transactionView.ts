import { format } from "date-fns";

import { calculateTotals, calculateTransactionTotal } from "@/domain/totals";
import type {
  Account,
  Category,
  Paise,
  Payee,
  Split,
  Transaction,
} from "@/domain/types";
import { formatPaise, paiseToRupeesString, toPaise } from "@/domain/money";

export interface TransactionDayGroup {
  dateKey: string;
  transactions: Transaction[];
  total: Paise;
}

export interface TransactionPartyDisplay {
  name: string;
  payeeId?: string;
}

export interface TransactionAccountDisplay {
  name: string;
  accountId?: string;
  balance?: Paise;
}

export type TransactionSort =
  "newest" | "oldest" | "title" | "amount-high" | "amount-low";

export interface TransactionFilters {
  search?: string;
  from?: string;
  to?: string;
  types?: readonly ("expense" | "income" | "transfer")[];
  accountIds?: readonly string[];
  categoryIds?: readonly string[];
  payeeIds?: readonly string[];
  amountMin?: Paise;
  amountMax?: Paise;
  labelIds?: readonly string[];
  statuses?: readonly ("uncleared" | "cleared" | "reconciled")[];
  sort?: TransactionSort;
}

export function groupTransactionsByLocalDate(
  transactions: readonly Transaction[],
  sort: TransactionSort = "newest",
): TransactionDayGroup[] {
  const included = transactions
    .filter((transaction) => !transaction.deleted)
    .sort((left, right) => compareTransactions(left, right, sort));
  const groups = new Map<string, Transaction[]>();

  for (const transaction of included) {
    const dateKey = format(new Date(transaction.occurredAt), "yyyy-MM-dd");
    const group = groups.get(dateKey) ?? [];
    group.push(transaction);
    groups.set(dateKey, group);
  }

  const grouped = Array.from(groups, ([dateKey, groupedTransactions]) => ({
    dateKey,
    transactions: groupedTransactions,
    total: calculateTotals(groupedTransactions).net,
  }));

  return grouped.sort((left, right) => {
    const leftFirst = left.transactions[0];
    const rightFirst = right.transactions[0];
    if (!leftFirst || !rightFirst) return 0;
    return compareTransactions(leftFirst, rightFirst, sort);
  });
}

export function getTransactionPartyDisplay(
  transaction: Transaction,
  payees: readonly Payee[],
): TransactionPartyDisplay {
  const relevantSplits = transaction.splits.filter(
    (split): split is Extract<Split, { type: "expense" | "income" }> =>
      split.type !== "transfer",
  );
  if (relevantSplits.length === 0) {
    return { name: "Transfer" };
  }

  const payeeIds = relevantSplits.map((split) => split.payeeId);
  if (
    payeeIds.every(
      (payeeId) => payeeIds[0] !== undefined && payeeId === payeeIds[0],
    )
  ) {
    const payeeId = payeeIds[0];
    return payeeId
      ? {
          name:
            payees.find((payee) => payee.id === payeeId)?.name ?? "Unspecified",
          payeeId,
        }
      : { name: "Unspecified" };
  }

  const highest = relevantSplits.reduce((best, split) =>
    split.amount > best.amount ? split : best,
  );
  const payeeId = highest.payeeId;
  return payeeId
    ? {
        name:
          payees.find((payee) => payee.id === payeeId)?.name ?? "Unspecified",
        payeeId,
      }
    : { name: "Unspecified" };
}

export function getTransactionAccountDisplay(
  transaction: Transaction,
  accounts: readonly Account[],
  balances: readonly { accountId: string; balance: Paise }[],
): TransactionAccountDisplay {
  const transfers = transaction.splits.filter(
    (split): split is Extract<Split, { type: "transfer" }> =>
      split.type === "transfer",
  );
  if (transfers.length > 0 && transfers.length === transaction.splits.length) {
    const transfer = transaction.splits.find(
      (split) => split.type === "transfer",
    );
    if (transfer?.type === "transfer") {
      const account = accounts.find(
        (candidate) => candidate.id === transfer.fromAccountId,
      );
      const balance = balances.find(
        (entry) => entry.accountId === transfer.fromAccountId,
      )?.balance;
      return {
        name: account?.name ?? "Unknown account",
        accountId: transfer.fromAccountId,
        balance,
      };
    }
  }

  if (transfers.length > 0) {
    return { name: "Multiple Accounts" };
  }

  const accountIds = transaction.splits
    .filter((split) => split.type !== "transfer")
    .map((split) => split.accountId);
  if (accountIds.length > 0 && accountIds.every((id) => id === accountIds[0])) {
    const accountId = accountIds[0];
    const account = accounts.find((candidate) => candidate.id === accountId);
    return {
      name: account?.name ?? "Unknown account",
      accountId,
      balance: balances.find((entry) => entry.accountId === accountId)?.balance,
    };
  }

  return { name: "Multiple Accounts" };
}

export function getTransactionPrimaryCategory(
  transaction: Transaction,
  categories: readonly Category[],
): Category | undefined {
  const relevantSplits = transaction.splits.filter(
    (split): split is Extract<Split, { type: "expense" | "income" }> =>
      split.type !== "transfer",
  );
  if (relevantSplits.length === 0) return undefined;
  const categoryId = relevantSplits.reduce((best, split) =>
    split.amount > best.amount ? split : best,
  ).categoryId;
  return categoryId
    ? categories.find((category) => category.id === categoryId)
    : undefined;
}

export function getTransactionAmountMode(
  transaction: Transaction,
): "always" | "none" {
  return transaction.splits.every((split) => split.type === "transfer")
    ? "none"
    : "always";
}

export function getTransactionAmount(transaction: Transaction): Paise {
  if (transaction.deleted) return toPaise(0);
  return calculateTransactionTotal(transaction);
}

export function filterAndSortTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
): Transaction[] {
  const search = filters.search?.trim().toLocaleLowerCase();
  const fromTime =
    filters.from !== undefined && filters.from !== ""
      ? parseFilterTime(filters.from, "from")
      : undefined;
  const toTime =
    filters.to !== undefined && filters.to !== ""
      ? parseFilterTime(filters.to, "to")
      : undefined;

  const included = transactions.filter((transaction) => {
    if (transaction.deleted) return false;

    const occurredTime = Date.parse(transaction.occurredAt);
    if (!Number.isFinite(occurredTime)) return false;
    if (fromTime !== undefined && occurredTime < fromTime) return false;
    if (toTime !== undefined && occurredTime > toTime) return false;

    if (
      filters.statuses &&
      filters.statuses.length > 0 &&
      !filters.statuses.includes(transaction.status)
    ) {
      return false;
    }

    if (filters.types && filters.types.length > 0) {
      const selectedTypes = new Set(filters.types);
      const hasMatchingType = transaction.splits.some((split) =>
        selectedTypes.has(split.type),
      );
      if (!hasMatchingType) {
        return false;
      }
    }

    if (filters.accountIds && filters.accountIds.length > 0) {
      const accountIds = new Set(filters.accountIds);
      const matches = transaction.splits.some((split) =>
        split.type === "transfer"
          ? accountIds.has(split.fromAccountId) ||
            accountIds.has(split.toAccountId)
          : accountIds.has(split.accountId),
      );
      if (!matches) return false;
    }

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      const categoryIds = new Set(filters.categoryIds);
      const matches = transaction.splits.some(
        (split) =>
          split.type !== "transfer" &&
          split.categoryId !== undefined &&
          categoryIds.has(split.categoryId),
      );
      if (!matches) return false;
    }

    if (filters.payeeIds && filters.payeeIds.length > 0) {
      const payeeIds = new Set(filters.payeeIds);
      const matches = transaction.splits.some(
        (split) =>
          split.type !== "transfer" &&
          split.payeeId !== undefined &&
          payeeIds.has(split.payeeId),
      );
      if (!matches) return false;
    }

    if (filters.labelIds && filters.labelIds.length > 0) {
      if (
        !filters.labelIds.some((labelId) =>
          transaction.labelIds.includes(labelId),
        )
      ) {
        return false;
      }
    }

    const absoluteAmount = toPaise(
      Math.abs(calculateTransactionTotal(transaction)),
    );
    if (filters.amountMin !== undefined && absoluteAmount < filters.amountMin) {
      return false;
    }
    if (filters.amountMax !== undefined && absoluteAmount > filters.amountMax) {
      return false;
    }

    if (search) {
      const total = calculateTransactionTotal(transaction);
      const searchable = [
        transaction.title,
        transaction.note,
        paiseToRupeesString(total),
        formatPaise(total),
        formatPaise(total, "none"),
        formatPaise(Math.abs(total) as Paise, "none"),
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (!searchable.includes(search)) return false;
    }

    return true;
  });

  return included.sort((left, right) =>
    compareTransactions(left, right, filters.sort ?? "newest"),
  );
}

export function calculateFilteredTransactionTotals(
  transactions: readonly Transaction[],
) {
  return calculateTotals(transactions);
}

function parseFilterTime(value: string, name: "from" | "to"): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new RangeError(`Invalid ${name} filter date`);
  }
  return time;
}

function compareTransactions(
  left: Transaction,
  right: Transaction,
  sort: TransactionSort,
): number {
  switch (sort) {
    case "oldest":
      return Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    case "title":
      return left.title.localeCompare(right.title);
    case "amount-high":
      return (
        Math.abs(calculateTransactionTotal(right)) -
        Math.abs(calculateTransactionTotal(left))
      );
    case "amount-low":
      return (
        Math.abs(calculateTransactionTotal(left)) -
        Math.abs(calculateTransactionTotal(right))
      );
    case "newest":
    default:
      return Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  }
}
