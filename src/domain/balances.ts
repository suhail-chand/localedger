import type { Account, Paise, Transaction } from "@/domain/types";
import { toPaise } from "@/domain/money";

export interface AccountBalance {
  accountId: string;
  balance: Paise;
}

export function calculateAccountBalance(
  account: Account,
  transactions: readonly Transaction[],
): Paise {
  if (account.deleted) {
    return toPaise(0);
  }

  let balance = safeCheckedSum([account.startingBalance]);
  const openingTime = Date.parse(account.openingDate);

  for (const transaction of transactions) {
    if (transaction.deleted) {
      continue;
    }
    if (Date.parse(transaction.occurredAt) < openingTime) {
      continue;
    }

    for (const split of transaction.splits) {
      if (split.type === "income" && split.accountId === account.id) {
        balance = addPaise(balance, split.amount);
      } else if (split.type === "expense" && split.accountId === account.id) {
        balance = subtractPaise(balance, split.amount);
      } else if (split.type === "transfer") {
        if (split.toAccountId === account.id) {
          balance = addPaise(balance, split.amount);
        } else if (split.fromAccountId === account.id) {
          balance = subtractPaise(balance, split.amount);
        }
      }
    }
  }

  return balance;
}

export function getAccountBalance(
  account: Account,
  transactions: readonly Transaction[],
): Paise {
  return calculateAccountBalance(account, transactions);
}

export function calculateAccountBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): AccountBalance[] {
  return accounts
    .filter((account) => !account.deleted)
    .map((account) => ({
      accountId: account.id,
      balance: calculateAccountBalance(account, transactions),
    }));
}

export function calculateNetWorth(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): Paise {
  const includedBalances = accounts
    .filter((account) => !account.deleted && !account.hideFromReports)
    .map((account) => calculateAccountBalance(account, transactions));
  return safeCheckedSum(includedBalances);
}

export function calculateBalanceSheet(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): readonly AccountBalance[] {
  return calculateAccountBalances(accounts, transactions).filter((entry) => {
    const account = accounts.find(
      (candidate) => candidate.id === entry.accountId,
    );
    return account !== undefined && !account.hideFromReports;
  });
}

function addPaise(left: Paise, right: Paise): Paise {
  return checkedPaise(BigInt(left) + BigInt(right));
}

function subtractPaise(left: Paise, right: Paise): Paise {
  return checkedPaise(BigInt(left) - BigInt(right));
}

function safeCheckedSum(values: readonly Paise[]): Paise {
  return checkedPaise(values.reduce((sum, value) => sum + BigInt(value), 0n));
}

function checkedPaise(value: bigint): Paise {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError("Paise balance exceeds the safe integer range");
  }
  return toPaise(Number(value));
}
