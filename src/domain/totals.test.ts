import { describe, expect, it } from "vitest";

import {
  calculateDashboardTotals,
  calculateMonthlyTotals,
  calculateTransactionTotal,
  calculateTotals,
} from "@/domain/totals";
import type { Account, Transaction } from "@/domain/types";
import { toPaise } from "@/domain/money";

const base = {
  id: "00010203-0405-4607-8809-0a0b0c0d0e0f",
  createdAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  deleted: false,
};

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    ...base,
    id: "11111111-1111-4111-8111-111111111111",
    name: "Bank",
    type: "savings",
    openingDate: base.createdAt,
    startingBalance: toPaise(0),
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
    occurredAt: "2026-02-10T12:00:00.000Z",
    currency: "INR",
    splits: [],
    labelIds: [],
    status: "cleared",
    note: "",
    ...overrides,
  };
}

describe("derived transaction totals", () => {
  it("subtracts expenses from income and ignores transfers", () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    const transaction = buildTransaction({
      splits: [
        {
          id: base.id,
          type: "income",
          amount: toPaise(5000),
          accountId,
          note: "",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          type: "expense",
          amount: toPaise(2000),
          accountId,
          note: "",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          type: "transfer",
          amount: toPaise(9999),
          fromAccountId: accountId,
          toAccountId: "44444444-4444-4444-8444-444444444444",
          note: "",
        },
      ],
    });

    expect(calculateTransactionTotal(transaction)).toBe(3000);
  });

  it("returns zero for tombstoned transactions", () => {
    expect(calculateTransactionTotal(buildTransaction({ deleted: true }))).toBe(
      0,
    );
  });

  it("aggregates income, expense and net across active transactions", () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    const transactions = [
      buildTransaction({
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(10000),
            accountId,
            note: "",
          },
        ],
      }),
      buildTransaction({
        splits: [
          {
            id: base.id,
            type: "expense",
            amount: toPaise(4000),
            accountId,
            note: "",
          },
        ],
      }),
    ];

    expect(calculateTotals(transactions)).toEqual({
      income: 10000,
      expense: 4000,
      net: 6000,
    });
  });

  it("excludes hidden accounts from dashboard totals", () => {
    const visible = buildAccount();
    const hidden = buildAccount({
      id: "55555555-5555-4555-8555-555555555555",
      hideFromReports: true,
    });
    const transactions = [
      buildTransaction({
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(7000),
            accountId: visible.id,
            note: "",
          },
        ],
      }),
      buildTransaction({
        splits: [
          {
            id: base.id,
            type: "expense",
            amount: toPaise(9000),
            accountId: hidden.id,
            note: "",
          },
        ],
      }),
    ];

    expect(calculateDashboardTotals(transactions, [visible, hidden])).toEqual({
      income: 7000,
      expense: 0,
      net: 7000,
    });
  });

  it("filters monthly totals with a UTC month boundary", () => {
    const account = buildAccount();
    const transactions = [
      buildTransaction({
        occurredAt: "2026-01-31T23:59:59.999Z",
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
      }),
      buildTransaction({
        occurredAt: "2026-02-01T00:00:00.000Z",
        splits: [
          {
            id: base.id,
            type: "expense",
            amount: toPaise(50),
            accountId: account.id,
            note: "",
          },
        ],
      }),
      buildTransaction({
        occurredAt: "2026-03-01T00:00:00.000Z",
        splits: [
          {
            id: base.id,
            type: "income",
            amount: toPaise(1000),
            accountId: account.id,
            note: "",
          },
        ],
      }),
    ];

    expect(calculateMonthlyTotals(transactions, [account], 2026, 2)).toEqual({
      income: 0,
      expense: 50,
      net: -50,
    });
  });
});
