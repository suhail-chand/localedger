import { describe, expect, it, vi } from "vitest";

import {
  calculateAccountBalancesAfterTransactions,
  calculateAccountBalance,
  calculateAccountBalances,
  calculateAccountTypeBalances,
  calculateBalanceSheetSummary,
  calculateNetWorth,
} from "@/domain/balances";
import type { Account, Transaction } from "@/domain/types";
import { toPaise } from "@/domain/money";

const base = {
  id: "00010203-0405-4607-8809-0a0b0c0d0e0f",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deleted: false,
};

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    ...base,
    id: overrides.id ?? base.id,
    name: "Wallet",
    type: "cash",
    openingDate: "2026-01-01T00:00:00.000Z",
    startingBalance: toPaise(10000),
    currency: "INR",
    note: "",
    hideFromTransactions: false,
    hideFromReports: false,
    ...overrides,
  };
}

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    ...base,
    title: "Test",
    occurredAt: "2026-01-02T00:00:00.000Z",
    currency: "INR",
    splits: [],
    labelIds: [],
    status: "cleared",
    note: "",
    ...overrides,
  };
}

describe("derived account balances", () => {
  it("includes starting, income, expense and transfer movements", () => {
    const account = buildAccount();
    const other = buildAccount({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Bank",
    });
    const transactions = [
      buildTransaction({
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(5000),
            accountId: account.id,
            note: "",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            type: "expense",
            amount: toPaise(2000),
            accountId: account.id,
            note: "",
          },
        ],
      }),
      buildTransaction({
        occurredAt: "2026-01-03T00:00:00.000Z",
        splits: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            type: "transfer",
            amount: toPaise(3000),
            fromAccountId: account.id,
            toAccountId: other.id,
            note: "",
          },
        ],
      }),
    ];

    expect(calculateAccountBalance(account, transactions)).toBe(10000);
    expect(calculateAccountBalance(other, transactions)).toBe(13000);
  });

  it("ignores transactions before opening date and tombstones", () => {
    const account = buildAccount({ openingDate: "2026-01-10T00:00:00.000Z" });
    const transactions = [
      buildTransaction({
        occurredAt: "2026-01-09T00:00:00.000Z",
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(5000),
            accountId: account.id,
            note: "",
          },
        ],
      }),
      buildTransaction({
        deleted: true,
        occurredAt: "2026-01-11T00:00:00.000Z",
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(5000),
            accountId: account.id,
            note: "",
          },
        ],
      }),
    ];

    expect(calculateAccountBalance(account, transactions)).toBe(10000);
  });

  it("includes transactions after local midnight on the opening date", () => {
    vi.stubEnv("TZ", "Asia/Kolkata");
    try {
      const account = buildAccount({
        openingDate: "2026-01-10T00:00:00.000Z",
      });
      const transaction = buildTransaction({
        occurredAt: "2026-01-09T19:01:00.000Z",
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(5000),
            accountId: account.id,
            note: "",
          },
        ],
      });

      expect(Date.parse(transaction.occurredAt)).toBeLessThan(
        Date.parse(account.openingDate),
      );
      expect(calculateAccountBalance(account, [transaction])).toBe(15000);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("calculates each transaction's balance in chronological order", () => {
    const account = buildAccount({
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(600000),
    });
    const earlier = buildTransaction({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      occurredAt: "2026-11-26T10:00:00.000Z",
      splits: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          type: "expense",
          amount: toPaise(2000),
          accountId: account.id,
          note: "",
        },
      ],
    });
    const later = buildTransaction({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      occurredAt: "2026-11-27T10:00:00.000Z",
      splits: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          type: "expense",
          amount: toPaise(200000),
          accountId: account.id,
          note: "",
        },
      ],
    });

    const snapshots = calculateAccountBalancesAfterTransactions(
      [account],
      [later, earlier],
    );

    expect(snapshots.get(earlier.id)).toEqual([
      { accountId: account.id, balance: toPaise(598000) },
    ]);
    expect(snapshots.get(later.id)).toEqual([
      { accountId: account.id, balance: toPaise(398000) },
    ]);
    expect(calculateAccountBalance(account, [earlier, later])).toBe(
      toPaise(398000),
    );
  });

  it("does not apply a transaction dated before the account opening date", () => {
    const account = buildAccount({
      openingDate: "2026-11-27T00:00:00.000Z",
      startingBalance: toPaise(600000),
    });
    const beforeOpening = buildTransaction({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      occurredAt: "2026-11-26T10:00:00.000Z",
      splits: [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          type: "expense",
          amount: toPaise(2000),
          accountId: account.id,
          note: "",
        },
      ],
    });
    const onOpeningDate = buildTransaction({
      id: "11111111-2222-4333-8444-555555555555",
      occurredAt: "2026-11-27T10:00:00.000Z",
      splits: [
        {
          id: "22222222-3333-4444-8555-666666666666",
          type: "expense",
          amount: toPaise(200000),
          accountId: account.id,
          note: "",
        },
      ],
    });

    const snapshots = calculateAccountBalancesAfterTransactions(
      [account],
      [beforeOpening, onOpeningDate],
    );

    expect(snapshots.get(beforeOpening.id)).toEqual([
      { accountId: account.id, balance: toPaise(600000) },
    ]);
    expect(snapshots.get(onOpeningDate.id)).toEqual([
      { accountId: account.id, balance: toPaise(400000) },
    ]);
    expect(
      calculateAccountBalance(account, [beforeOpening, onOpeningDate]),
    ).toBe(toPaise(400000));
  });

  it("includes income and transfer movements in row balances", () => {
    const wallet = buildAccount({
      startingBalance: toPaise(6000),
    });
    const bank = buildAccount({
      id: "33333333-4444-4555-8666-777777777777",
      name: "Bank",
      startingBalance: toPaise(100),
    });
    const income = buildTransaction({
      id: "44444444-5555-4666-8777-888888888888",
      splits: [
        {
          id: "55555555-6666-4777-8888-999999999999",
          type: "income",
          amount: toPaise(1000),
          accountId: wallet.id,
          note: "",
        },
      ],
    });
    const transfer = buildTransaction({
      id: "66666666-7777-4888-8999-aaaaaaaaaaaa",
      occurredAt: "2026-01-03T00:00:00.000Z",
      splits: [
        {
          id: "77777777-8888-4999-8aaa-bbbbbbbbbbbb",
          type: "transfer",
          amount: toPaise(500),
          fromAccountId: wallet.id,
          toAccountId: bank.id,
          note: "",
        },
      ],
    });

    const snapshots = calculateAccountBalancesAfterTransactions(
      [wallet, bank],
      [transfer, income],
    );

    expect(snapshots.get(income.id)).toEqual([
      { accountId: wallet.id, balance: toPaise(7000) },
    ]);
    expect(snapshots.get(transfer.id)).toEqual([
      { accountId: wallet.id, balance: toPaise(6500) },
      { accountId: bank.id, balance: toPaise(600) },
    ]);
  });

  it("supports negative balances and excludes hidden accounts from net worth", () => {
    const loan = buildAccount({
      id: "44444444-4444-4444-8444-444444444444",
      name: "Loan",
      type: "loan",
      startingBalance: toPaise(-100000),
    });
    const hidden = buildAccount({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Hidden",
      startingBalance: toPaise(50000),
      hideFromReports: true,
    });

    expect(
      calculateAccountBalances([loan, hidden], []).map(
        (entry) => entry.balance,
      ),
    ).toEqual([-100000, 50000]);
    expect(calculateNetWorth([loan, hidden], [])).toBe(-100000);
  });

  it("returns zero for a deleted account", () => {
    expect(calculateAccountBalance(buildAccount({ deleted: true }), [])).toBe(
      0,
    );
  });

  it("summarizes assets, liabilities and per-type totals for the balance sheet", () => {
    const savings = buildAccount({
      id: "66666666-6666-4666-8666-666666666666",
      name: "Savings",
      type: "savings",
      startingBalance: toPaise(150000),
    });
    const loan = buildAccount({
      id: "77777777-7777-4777-8777-777777777777",
      name: "Loan",
      type: "loan",
      startingBalance: toPaise(-50000),
    });
    const hidden = buildAccount({
      id: "88888888-8888-4888-8888-888888888888",
      name: "Hidden",
      type: "cash",
      startingBalance: toPaise(250000),
      hideFromReports: true,
    });

    expect(calculateBalanceSheetSummary([savings, loan, hidden], [])).toEqual({
      assets: 150000,
      liabilities: 50000,
      netWorth: 100000,
    });
    expect(calculateAccountTypeBalances([savings, loan, hidden], [])).toEqual([
      { accountType: "savings", balance: 150000 },
      { accountType: "loan", balance: -50000 },
    ]);
  });
});
