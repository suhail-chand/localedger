import { format } from "date-fns";

import type { Account, AccountType, Paise, Transaction } from "@/domain/types";
import { toPaise } from "@/domain/money";

export interface AccountBalance {
  accountId: string;
  balance: Paise;
}

export interface AccountTypeBalance {
  accountType: AccountType;
  balance: Paise;
}

export interface BalanceSheetSummary {
  assets: Paise;
  liabilities: Paise;
  netWorth: Paise;
}

const assetAccountTypes = new Set<AccountType>([
  "cash",
  "savings",
  "receivable",
  "investment",
  "other",
]);

const liabilityAccountTypes = new Set<AccountType>([
  "credit_card",
  "loan",
  "liability",
  "payable",
]);

export function calculateAccountBalance(
  account: Account,
  transactions: readonly Transaction[],
): Paise {
  if (account.deleted) {
    return toPaise(0);
  }

  let balance = safeCheckedSum([account.startingBalance]);
  const openingDate = account.openingDate.slice(0, 10);

  for (const transaction of transactions) {
    if (transaction.deleted) {
      continue;
    }
    if (format(new Date(transaction.occurredAt), "yyyy-MM-dd") < openingDate) {
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

export function calculateAccountBalancesAfterTransactions(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): ReadonlyMap<string, readonly AccountBalance[]> {
  const activeAccounts = accounts.filter((account) => !account.deleted);
  const balances = new Map(
    activeAccounts.map((account) => [account.id, account.startingBalance]),
  );
  const openingDates = new Map(
    activeAccounts.map((account) => [
      account.id,
      account.openingDate.slice(0, 10),
    ]),
  );
  const orderedTransactions = transactions
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => !transaction.deleted)
    .sort(
      (left, right) =>
        Date.parse(left.transaction.occurredAt) -
          Date.parse(right.transaction.occurredAt) ||
        left.transaction.id.localeCompare(right.transaction.id) ||
        left.index - right.index,
    );
  const snapshots = new Map<string, readonly AccountBalance[]>();

  for (const { transaction } of orderedTransactions) {
    const touchedAccountIds = new Set<string>();
    const transactionDate = format(
      new Date(transaction.occurredAt),
      "yyyy-MM-dd",
    );

    for (const split of transaction.splits) {
      if (split.type === "income") {
        applyMovement(
          split.accountId,
          split.amount,
          true,
          transactionDate,
          balances,
          openingDates,
          touchedAccountIds,
        );
      } else if (split.type === "expense") {
        applyMovement(
          split.accountId,
          split.amount,
          false,
          transactionDate,
          balances,
          openingDates,
          touchedAccountIds,
        );
      } else {
        applyMovement(
          split.fromAccountId,
          split.amount,
          false,
          transactionDate,
          balances,
          openingDates,
          touchedAccountIds,
        );
        applyMovement(
          split.toAccountId,
          split.amount,
          true,
          transactionDate,
          balances,
          openingDates,
          touchedAccountIds,
        );
      }
    }

    snapshots.set(
      transaction.id,
      Array.from(touchedAccountIds, (accountId) => ({
        accountId,
        balance: balances.get(accountId) ?? toPaise(0),
      })),
    );
  }

  return snapshots;
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

export function calculateAccountTypeBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): readonly AccountTypeBalance[] {
  const balances = new Map(
    calculateAccountBalances(accounts, transactions).map((entry) => [
      entry.accountId,
      entry.balance,
    ]),
  );
  const totals = new Map<AccountType, bigint>();

  for (const account of accounts) {
    if (account.deleted || account.hideFromReports) continue;
    const balance = balances.get(account.id) ?? toPaise(0);
    totals.set(
      account.type,
      (totals.get(account.type) ?? 0n) + BigInt(balance),
    );
  }

  return Array.from(totals, ([accountType, balance]) => ({
    accountType,
    balance: checkedPaise(balance),
  }));
}

export function calculateBalanceSheetSummary(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): BalanceSheetSummary {
  let assets = 0n;
  let liabilities = 0n;

  for (const account of accounts) {
    if (account.deleted || account.hideFromReports) continue;
    const balance = calculateAccountBalance(account, transactions);

    if (assetAccountTypes.has(account.type) && balance > 0) {
      assets += BigInt(balance);
    }
    if (liabilityAccountTypes.has(account.type) && balance < 0) {
      liabilities += -BigInt(balance);
    }
  }

  return {
    assets: checkedPaise(assets),
    liabilities: checkedPaise(liabilities),
    netWorth: calculateNetWorth(accounts, transactions),
  };
}

function addPaise(left: Paise, right: Paise): Paise {
  return checkedPaise(BigInt(left) + BigInt(right));
}

function subtractPaise(left: Paise, right: Paise): Paise {
  return checkedPaise(BigInt(left) - BigInt(right));
}

function applyMovement(
  accountId: string,
  amount: Paise,
  isCredit: boolean,
  transactionDate: string,
  balances: Map<string, Paise>,
  openingDates: Map<string, string>,
  touchedAccountIds: Set<string>,
): void {
  const balance = balances.get(accountId);
  const openingDate = openingDates.get(accountId);
  if (balance === undefined || openingDate === undefined) return;

  touchedAccountIds.add(accountId);
  if (transactionDate < openingDate) return;

  balances.set(
    accountId,
    isCredit ? addPaise(balance, amount) : subtractPaise(balance, amount),
  );
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
