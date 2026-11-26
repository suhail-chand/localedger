import { describe, expect, it } from "vitest";

import {
  calculateAccountBalance,
  calculateAccountBalances,
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
});
