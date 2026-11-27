import type { Account, Paise, Transaction } from "@/domain/types";
import { toPaise } from "@/domain/money";

export interface TransactionTotals {
  income: Paise;
  expense: Paise;
  net: Paise;
}

export function calculateTransactionIncome(transaction: Transaction): Paise {
  if (transaction.deleted) {
    return toPaise(0);
  }
  return safeSum(
    transaction.splits
      .filter((split) => split.type === "income")
      .map((split) => split.amount),
  );
}

export function calculateTransactionExpense(transaction: Transaction): Paise {
  if (transaction.deleted) {
    return toPaise(0);
  }
  return safeSum(
    transaction.splits
      .filter((split) => split.type === "expense")
      .map((split) => split.amount),
  );
}

export function calculateTransactionTotal(transaction: Transaction): Paise {
  if (transaction.deleted) {
    return toPaise(0);
  }
  return checkedPaise(
    BigInt(calculateTransactionIncome(transaction)) -
      BigInt(calculateTransactionExpense(transaction)),
  );
}

export function getTransactionTotal(transaction: Transaction): Paise {
  return calculateTransactionTotal(transaction);
}

export function calculateTotals(
  transactions: readonly Transaction[],
): TransactionTotals {
  const included = transactions.filter((transaction) => !transaction.deleted);
  const income = safeSum(included.map(calculateTransactionIncome));
  const expense = safeSum(included.map(calculateTransactionExpense));
  return {
    income,
    expense,
    net: checkedPaise(BigInt(income) - BigInt(expense)),
  };
}

export function calculateDashboardTotals(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
): TransactionTotals {
  const visibleAccountIds = new Set(
    accounts
      .filter((account) => !account.deleted && !account.hideFromReports)
      .map((account) => account.id),
  );

  let income = 0n;
  let expense = 0n;

  for (const transaction of transactions) {
    if (transaction.deleted) {
      continue;
    }
    for (const split of transaction.splits) {
      if (split.type === "income") {
        if (visibleAccountIds.has(split.accountId)) {
          income += BigInt(split.amount);
        }
      } else if (split.type === "expense") {
        if (visibleAccountIds.has(split.accountId)) {
          expense += BigInt(split.amount);
        }
      }
    }
  }

  const incomePaise = checkedPaise(income);
  const expensePaise = checkedPaise(expense);
  return {
    income: incomePaise,
    expense: expensePaise,
    net: checkedPaise(income - expense),
  };
}

export function calculateMonthlyTotals(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  year: number,
  month: number,
): TransactionTotals {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new RangeError("Month and year must define a valid calendar month");
  }

  const startTime = Date.UTC(year, month - 1, 1);
  const endTime = Date.UTC(year, month, 1);
  const inMonth = transactions.filter((transaction) => {
    const occurredTime = Date.parse(transaction.occurredAt);
    return (
      !transaction.deleted &&
      occurredTime >= startTime &&
      occurredTime < endTime
    );
  });
  return calculateDashboardTotals(inMonth, accounts);
}

export function calculateTransactionTotals(
  transactions: readonly Transaction[],
): TransactionTotals {
  return calculateTotals(transactions);
}

function safeSum(values: readonly Paise[]): Paise {
  return checkedPaise(values.reduce((sum, value) => sum + BigInt(value), 0n));
}

function checkedPaise(value: bigint): Paise {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError("Paise total exceeds the safe integer range");
  }
  return toPaise(Number(value));
}
