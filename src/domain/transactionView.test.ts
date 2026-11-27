import { describe, expect, it } from "vitest";

import { toPaise } from "@/domain/money";
import type { Account, Payee, Transaction } from "@/domain/types";
import {
  calculateFilteredTransactionTotals,
  filterAndSortTransactions,
  getTransactionAccountDisplay,
  getTransactionPartyDisplay,
  groupTransactionsByLocalDate,
} from "./transactionView";

function transaction(
  id: string,
  occurredAt: string,
  splits: Transaction["splits"],
  changes: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    deleted: false,
    title: `Transaction ${id}`,
    occurredAt,
    currency: "INR",
    splits,
    labelIds: [],
    status: "cleared",
    note: "",
    ...changes,
  };
}

const account = {
  id: "10000000-0000-4000-8000-000000000001",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  deleted: false,
  name: "Wallet",
  type: "cash",
  openingDate: "2026-11-01T00:00:00.000Z",
  startingBalance: toPaise(0),
  currency: "INR",
  note: "",
  hideFromTransactions: false,
  hideFromReports: false,
} satisfies Account;

describe("transactionView", () => {
  it("groups live transactions by local date and excludes tombstones", () => {
    const expense = transaction(
      "20000000-0000-4000-8000-000000000001",
      "2026-11-26T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000001",
          type: "expense",
          amount: toPaise(5000),
          accountId: account.id,
          note: "",
        },
      ],
    );
    const income = transaction(
      "20000000-0000-4000-8000-000000000002",
      "2026-11-26T11:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000002",
          type: "income",
          amount: toPaise(8000),
          accountId: account.id,
          note: "",
        },
      ],
    );
    const deleted = transaction(
      "20000000-0000-4000-8000-000000000003",
      "2026-11-27T11:30:00.000Z",
      [],
      { deleted: true },
    );

    const groups = groupTransactionsByLocalDate([deleted, expense, income]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.transactions.map((item) => item.id)).toEqual([
      income.id,
      expense.id,
    ]);
    expect(groups[0]?.total).toBe(3000);
  });

  it("uses a shared payee and otherwise the highest-amount split payee", () => {
    const payeeA = {
      id: "40000000-0000-4000-8000-000000000001",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      deleted: false,
      name: "Cafe",
    } satisfies Payee;
    const payeeB = {
      id: "40000000-0000-4000-8000-000000000002",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      deleted: false,
      name: "Market",
    } satisfies Payee;
    const shared = transaction(
      "20000000-0000-4000-8000-000000000004",
      "2026-11-26T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000003",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          payeeId: payeeA.id,
          note: "",
        },
        {
          id: "30000000-0000-4000-8000-000000000004",
          type: "expense",
          amount: toPaise(200),
          accountId: account.id,
          payeeId: payeeA.id,
          note: "",
        },
      ],
    );
    const split = transaction(
      "20000000-0000-4000-8000-000000000005",
      "2026-11-26T10:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000005",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          payeeId: payeeA.id,
          note: "",
        },
        {
          id: "30000000-0000-4000-8000-000000000006",
          type: "expense",
          amount: toPaise(900),
          accountId: account.id,
          payeeId: payeeB.id,
          note: "",
        },
      ],
    );

    expect(getTransactionPartyDisplay(shared, [payeeA, payeeB]).name).toBe(
      "Cafe",
    );
    expect(getTransactionPartyDisplay(split, [payeeA, payeeB]).name).toBe(
      "Market",
    );
  });

  it("shows multiple accounts and the debit account for transfers", () => {
    const toAccount = {
      ...account,
      id: "10000000-0000-4000-8000-000000000002",
      name: "Savings",
    };
    const mixed = transaction(
      "20000000-0000-4000-8000-000000000006",
      "2026-11-26T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000007",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          note: "",
        },
        {
          id: "30000000-0000-4000-8000-000000000008",
          type: "transfer",
          amount: toPaise(100),
          fromAccountId: account.id,
          toAccountId: toAccount.id,
          note: "",
        },
      ],
    );
    const transfer = transaction(
      "20000000-0000-4000-8000-000000000007",
      "2026-11-26T10:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000009",
          type: "transfer",
          amount: toPaise(100),
          fromAccountId: account.id,
          toAccountId: toAccount.id,
          note: "",
        },
      ],
    );
    const balances = [
      { accountId: account.id, balance: toPaise(1000) },
      { accountId: toAccount.id, balance: toPaise(2000) },
    ];

    expect(
      getTransactionAccountDisplay(mixed, [account, toAccount], balances).name,
    ).toBe("Multiple Accounts");
    expect(
      getTransactionAccountDisplay(transfer, [account, toAccount], balances),
    ).toMatchObject({
      name: "Wallet",
      accountId: account.id,
      balance: 1000,
    });
  });

  it("keeps DST-date grouping local and newest-first", () => {
    const before = transaction(
      "20000000-0000-4000-8000-000000000008",
      "2026-03-29T00:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000010",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          note: "",
        },
      ],
    );
    const after = transaction(
      "20000000-0000-4000-8000-000000000009",
      "2026-03-29T22:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000011",
          type: "expense",
          amount: toPaise(200),
          accountId: account.id,
          note: "",
        },
      ],
    );

    const groups = groupTransactionsByLocalDate([before, after]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.transactions[0]?.id).toBe(after.id);
  });

  it("combines search, range, type and label filters", () => {
    const expense = transaction(
      "20000000-0000-4000-8000-000000000010",
      "2026-11-26T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000012",
          type: "expense",
          amount: toPaise(250),
          accountId: account.id,
          note: "Office snack",
        },
      ],
      {
        title: "Groceries",
        labelIds: ["50000000-0000-4000-8000-000000000001"],
      },
    );
    const income = transaction(
      "20000000-0000-4000-8000-000000000011",
      "2026-11-27T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000013",
          type: "income",
          amount: toPaise(5000),
          accountId: account.id,
          note: "Salary",
        },
      ],
    );

    const filtered = filterAndSortTransactions([income, expense], {
      search: "gro",
      from: "2026-11-26T00:00:00.000Z",
      to: "2026-11-26T23:59:59.999Z",
      types: ["expense"],
      accountIds: [account.id],
      amountMin: toPaise(200),
      amountMax: toPaise(300),
      labelIds: ["50000000-0000-4000-8000-000000000001"],
    });

    expect(filtered.map((item) => item.id)).toEqual([expense.id]);
  });

  it("searches formatted rupee amounts and calculates filtered totals", () => {
    const expense = transaction(
      "20000000-0000-4000-8000-000000000012",
      "2026-11-26T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000014",
          type: "expense",
          amount: toPaise(250),
          accountId: account.id,
          note: "",
        },
      ],
    );
    const found = filterAndSortTransactions([expense], { search: "2.50" });

    expect(found).toHaveLength(1);
    expect(calculateFilteredTransactionTotals(found)).toEqual({
      income: 0,
      expense: 250,
      net: -250,
    });
  });

  it("rejects invalid from and to filter dates", () => {
    expect(() =>
      filterAndSortTransactions([], { from: "not-a-date" }),
    ).toThrowError(RangeError);
    expect(() =>
      filterAndSortTransactions([], { to: "not-a-date" }),
    ).toThrowError(RangeError);
  });

  it("matches any selected label and excludes transactions missing every label", () => {
    const work = "50000000-0000-4000-8000-000000000001";
    const home = "50000000-0000-4000-8000-000000000002";
    const workOnly = transaction(
      "20000000-0000-4000-8000-000000000017",
      "2026-11-26T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000017",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          note: "",
        },
      ],
      { labelIds: [work] },
    );
    const both = transaction(
      "20000000-0000-4000-8000-000000000018",
      "2026-11-26T10:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000018",
          type: "expense",
          amount: toPaise(200),
          accountId: account.id,
          note: "",
        },
      ],
      { labelIds: [work, home] },
    );
    const neither = transaction(
      "20000000-0000-4000-8000-000000000019",
      "2026-11-26T11:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000019",
          type: "expense",
          amount: toPaise(300),
          accountId: account.id,
          note: "",
        },
      ],
    );

    const filtered = filterAndSortTransactions([neither, workOnly, both], {
      labelIds: [work, home],
    });

    expect(filtered.map((item) => item.id)).toEqual([both.id, workOnly.id]);
  });

  it("sorts by title and highest or lowest absolute amount", () => {
    const low = transaction(
      "20000000-0000-4000-8000-000000000013",
      "2026-11-26T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000015",
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          note: "",
        },
      ],
      { title: "Zoo" },
    );
    const high = transaction(
      "20000000-0000-4000-8000-000000000014",
      "2026-11-27T09:30:00.000Z",
      [
        {
          id: "30000000-0000-4000-8000-000000000016",
          type: "income",
          amount: toPaise(900),
          accountId: account.id,
          note: "",
        },
      ],
      { title: "Alpha" },
    );

    expect(
      filterAndSortTransactions([low, high], { sort: "title" }).map(
        (item) => item.title,
      ),
    ).toEqual(["Alpha", "Zoo"]);
    expect(
      filterAndSortTransactions([low, high], { sort: "amount-high" }).map(
        (item) => item.id,
      ),
    ).toEqual([high.id, low.id]);
    expect(
      filterAndSortTransactions([low, high], { sort: "amount-low" }).map(
        (item) => item.id,
      ),
    ).toEqual([low.id, high.id]);
  });
});
