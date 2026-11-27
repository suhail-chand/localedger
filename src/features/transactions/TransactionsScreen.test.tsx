import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureDatabaseReady } from "@/data/db";
import {
  createAccountRepository,
  createCategoryGroupRepository,
  createCategoryRepository,
  createLabelRepository,
  createPayeeGroupRepository,
  createPayeeRepository,
  createTransactionRepository,
} from "@/data/repositories";
import { toPaise } from "@/domain/money";
import { TransactionsScreen } from "./TransactionsScreen";

describe("TransactionsScreen", () => {
  beforeEach(async () => {
    await ensureDatabaseReady(db);
    await db.accounts.clear();
    await db.categories.clear();
    await db.payees.clear();
    await db.labels.clear();
    await db.transactions.clear();
    await db.scheduledTransactions.clear();
  });

  it("creates an expense with a calculator amount and UTC date", async () => {
    const accounts = createAccountRepository(db);
    await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });
    await user.type(within(dialog).getByLabelText("Title"), "Groceries");
    await user.clear(within(dialog).getByLabelText("Amount (INR)"));
    await user.type(within(dialog).getByLabelText("Amount (INR)"), "50+25");
    await user.selectOptions(
      within(dialog).getByLabelText("Debited account"),
      (await accounts.list())[0]?.id ?? "",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect(await db.transactions.count()).toBe(1);
    });
    const transaction = await db.transactions.toCollection().first();
    expect(transaction?.title).toBe("Groceries");
    expect(transaction?.splits[0]?.amount).toBe(7500);
    expect(transaction?.occurredAt).toMatch(/T.*Z$/);
  });

  it("edits an existing transaction", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await transactions.create({
      title: "Old title",
      occurredAt: "2026-11-26T09:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(100),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Open Old title" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit transaction" });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "New title");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect((await db.transactions.toCollection().first())?.title).toBe(
        "New title",
      );
    });
  });

  it("keeps hidden accounts available only for existing edit splits", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    await accounts.create({
      name: "Visible account",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const hiddenAccount = await accounts.create({
      name: "Hidden account",
      type: "savings",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: true,
      hideFromReports: false,
    });
    await transactions.create({
      title: "Existing hidden-account expense",
      occurredAt: "2026-11-26T09:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(100),
          accountId: hiddenAccount.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });

    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(
      await screen.findByRole("button", {
        name: "Open Existing hidden-account expense",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit transaction" });
    const existingAccount = within(dialog).getByLabelText("Debited account");
    expect(
      within(existingAccount).getByRole("option", { name: "Hidden account" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Add split" }));
    const splitAccounts = within(dialog).getAllByLabelText("Debited account");
    expect(splitAccounts).toHaveLength(2);
    const newSplitAccount = splitAccounts[1];
    if (!newSplitAccount)
      throw new Error("New split account select was not rendered");
    expect(
      within(newSplitAccount).queryByRole("option", {
        name: "Hidden account",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(newSplitAccount).getByRole("option", {
        name: "Visible account",
      }),
    ).toBeInTheDocument();
  });

  it("rejects a transfer to the same account and keeps the form open", async () => {
    const accounts = createAccountRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });
    await user.type(within(dialog).getByLabelText("Title"), "Move money");
    await user.selectOptions(within(dialog).getByLabelText("Type"), "transfer");
    await user.clear(within(dialog).getByLabelText("Amount (INR)"));
    await user.type(within(dialog).getByLabelText("Amount (INR)"), "100");
    await user.selectOptions(
      within(dialog).getByLabelText("Account from"),
      account.id,
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Account to"),
      account.id,
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Transfer accounts must be different",
    );
    expect(await db.transactions.count()).toBe(0);
  });

  it("shows inline validation and keeps the form open for missing required fields", async () => {
    const accounts = createAccountRepository(db);
    await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });
    await user.clear(within(dialog).getByLabelText("Amount (INR)"));
    await user.type(within(dialog).getByLabelText("Amount (INR)"), "0");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Title is required",
    );
    expect(within(dialog).getByLabelText("Amount (INR)")).toHaveValue("0");
    expect(await db.transactions.count()).toBe(0);

    await user.type(within(dialog).getByLabelText("Title"), "Valid title");
    await user.clear(within(dialog).getByLabelText("Amount (INR)"));
    await user.type(within(dialog).getByLabelText("Amount (INR)"), "0");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Split amount must be greater than zero",
    );
    expect(await db.transactions.count()).toBe(0);
  });

  it("prevents duplicate submissions", async () => {
    const accounts = createAccountRepository(db);
    await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });
    await user.type(within(dialog).getByLabelText("Title"), "One entry");
    await user.clear(within(dialog).getByLabelText("Amount (INR)"));
    await user.type(within(dialog).getByLabelText("Amount (INR)"), "25");
    await user.selectOptions(
      within(dialog).getByLabelText("Debited account"),
      (await accounts.list())[0]?.id ?? "",
    );
    const save = within(dialog).getByRole("button", { name: "Save" });
    await user.dblClick(save);

    await waitFor(async () => {
      expect(await db.transactions.count()).toBe(1);
    });
  });

  it("loads labels and can attach one to a transaction", async () => {
    const accounts = createAccountRepository(db);
    const labels = createLabelRepository(db);
    await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await labels.create({ name: "Monthly", color: "#2563EB" });
    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });
    await user.type(within(dialog).getByLabelText("Title"), "Subscription");
    await user.clear(within(dialog).getByLabelText("Amount (INR)"));
    await user.type(within(dialog).getByLabelText("Amount (INR)"), "10");
    await user.selectOptions(
      within(dialog).getByLabelText("Debited account"),
      (await accounts.list())[0]?.id ?? "",
    );
    await user.click(within(dialog).getByLabelText("Monthly"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const transaction = await db.transactions.toCollection().first();
      expect(transaction?.labelIds).toHaveLength(1);
    });
  });

  it("groups single-select account, category and payee options", async () => {
    const accounts = createAccountRepository(db);
    const categoryGroups = createCategoryGroupRepository(db);
    const categories = createCategoryRepository(db);
    const payeeGroups = createPayeeGroupRepository(db);
    const payees = createPayeeRepository(db);
    await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const categoryGroup = await categoryGroups.create({
      name: "Groceries",
      kind: "expense",
    });
    await categories.create({
      name: "Food",
      icon: "utensils",
      groupId: categoryGroup.id,
      kind: "expense",
    });
    const payeeGroup = await payeeGroups.create({ name: "Friends" });
    await payees.create({ name: "Cafe", groupId: payeeGroup.id });

    const user = userEvent.setup();
    render(<TransactionsScreen />);
    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    const dialog = screen.getByRole("dialog", { name: "Add transaction" });

    const groupedOptions: [string, string, string][] = [
      ["Debited account", "Wallet", "Cash"],
      ["Category", "Food", "Groceries"],
      ["Payee", "Cafe", "Friends"],
    ];
    for (const [label, optionName, groupName] of groupedOptions) {
      const select = within(dialog).getByLabelText(label);
      const option = await within(select).findByRole("option", {
        name: optionName,
      });
      expect(option.closest("optgroup")).toHaveAttribute("label", groupName);
    }
  });

  it("groups transactions by date and soft-deletes with undo", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await transactions.create({
      title: "Lunch",
      occurredAt: "2026-11-26T09:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(250),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    const user = userEvent.setup();
    render(<TransactionsScreen />);

    expect(
      await screen.findByText("Thursday, November 26"),
    ).toBeInTheDocument();
    const lunchHeading = screen.getByRole("heading", { name: "Lunch" });
    const lunchRow = lunchHeading.closest("article");
    expect(lunchRow).not.toBeNull();
    if (lunchRow) {
      expect(within(lunchRow).getByText(/Wallet/)).toHaveTextContent(
        "(-₹2.50)",
      );
      expect(within(lunchRow).getByText("-₹2.50")).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Open Lunch" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit transaction" });
    await user.click(
      within(editDialog).getByRole("button", { name: "Delete transaction" }),
    );
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("Lunch")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Lunch")).toBeInTheDocument();
  });

  it("restores a transaction from trash", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const transaction = await transactions.create({
      title: "Archived lunch",
      occurredAt: "2026-11-26T09:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(250),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    await transactions.softDelete(transaction.id);

    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(screen.getByRole("tab", { name: /Trash/ }));
    expect(screen.queryByText("Search and filters")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add transaction" }),
    ).toBeDisabled();
    expect(screen.queryByText("Filtered total")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(async () => {
      expect((await transactions.get(transaction.id))?.deleted).toBe(false);
    });
  });

  it("requires confirmation before permanently purging a trashed transaction", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const transaction = await transactions.create({
      title: "Purge me",
      occurredAt: "2026-11-26T09:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(250),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    await transactions.softDelete(transaction.id);

    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await user.click(screen.getByRole("tab", { name: /Trash/ }));
    await user.click(
      await screen.findByRole("button", { name: "Delete permanently" }),
    );
    const dialog = screen.getByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(async () => {
      expect(await transactions.get(transaction.id)).toBeUndefined();
    });
  });

  it("filters, sorts and shows filtered and selected totals", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-11-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await transactions.create({
      title: "Alpha expense",
      occurredAt: "2026-11-26T09:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(250),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    await transactions.create({
      title: "Salary",
      occurredAt: "2026-11-27T09:30:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "income",
          amount: toPaise(5000),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });

    const user = userEvent.setup();
    render(<TransactionsScreen />);

    await screen.findByRole("heading", { name: "Salary" });
    expect(screen.queryByText("Filtered total")).not.toBeInTheDocument();

    await user.click(await screen.findByText("Search and filters"));
    const sortField = screen.getByLabelText("Sort").closest("label");
    expect(sortField?.parentElement?.lastElementChild).toBe(sortField);
    await user.type(screen.getByLabelText("Search"), "Salary");

    expect(
      await screen.findByRole("heading", { name: "Salary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Alpha expense" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Filtered total")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.queryByText("Alpha expense")).not.toBeInTheDocument();
    expect(screen.getByText("Filtered total").parentElement).toHaveTextContent(
      "+₹50.00",
    );

    await user.click(screen.getByRole("checkbox", { name: "Select Salary" }));
    expect(screen.getByText("Selected total").parentElement).toHaveTextContent(
      "+₹50.00",
    );
    await user.click(screen.getByRole("checkbox", { name: "Select Salary" }));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("heading", { name: "Alpha expense" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Filtered total")).not.toBeInTheDocument();
  });

  it("navigates only between months with filtered transactions", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    for (const { title, occurredAt } of [
      { title: "January entry", occurredAt: "2026-01-15T12:00:00.000Z" },
      { title: "March entry", occurredAt: "2026-03-15T12:00:00.000Z" },
      { title: "June entry", occurredAt: "2026-06-15T12:00:00.000Z" },
    ]) {
      await transactions.create({
        title,
        occurredAt,
        currency: "INR",
        splits: [
          {
            id: crypto.randomUUID(),
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      });
    }

    const user = userEvent.setup();
    render(<TransactionsScreen />);

    expect(await screen.findByText("June 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Older month" }));
    expect(await screen.findByText("March 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "March entry" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Older month" }));
    expect(await screen.findByText("January 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "January entry" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "March entry" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Search and filters"));
    await user.type(screen.getByLabelText("Search"), "March entry");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("March 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Older month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Newer month" })).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "March entry" }),
    ).toBeInTheDocument();
  });

  it("reveals more transactions progressively within a month", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    for (let index = 1; index <= 101; index += 1) {
      await transactions.create({
        title: `Entry ${index}`,
        occurredAt: new Date(Date.UTC(2026, 0, 15, 12, index)).toISOString(),
        currency: "INR",
        splits: [
          {
            id: crypto.randomUUID(),
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      });
    }

    const user = userEvent.setup();
    render(<TransactionsScreen />);

    expect(
      await screen.findByRole("heading", { name: "Entry 101" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Entry 2" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Entry 1" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show more transactions" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Entry 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show more transactions" }),
    ).not.toBeInTheDocument();
  });

  it("applies each sort option to the visible transaction order", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-11-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    for (const { title, amount, occurredAt } of [
      {
        title: "Zulu",
        amount: 100,
        occurredAt: "2026-11-27T09:30:00.000Z",
      },
      {
        title: "Alpha",
        amount: 900,
        occurredAt: "2026-11-25T09:30:00.000Z",
      },
      {
        title: "Mike",
        amount: 500,
        occurredAt: "2026-11-26T09:30:00.000Z",
      },
    ]) {
      await transactions.create({
        title,
        occurredAt,
        currency: "INR",
        splits: [
          {
            id: crypto.randomUUID(),
            type: "expense",
            amount: toPaise(amount),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      });
    }

    const user = userEvent.setup();
    render(<TransactionsScreen />);
    await screen.findByRole("heading", { name: "Zulu" });
    await user.click(await screen.findByText("Search and filters"));
    const sort = screen.getByLabelText("Sort");
    const applySort = async (option: string, expected: string[]) => {
      await user.selectOptions(sort, option);
      await user.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => {
        expect(
          screen
            .getAllByRole("heading", { level: 3 })
            .map((heading) => heading.textContent),
        ).toEqual(expected);
      });
    };

    await applySort("oldest", ["Alpha", "Mike", "Zulu"]);
    await applySort("title", ["Alpha", "Mike", "Zulu"]);
    await applySort("amount-high", ["Alpha", "Mike", "Zulu"]);
    await applySort("amount-low", ["Zulu", "Mike", "Alpha"]);
    await applySort("newest", ["Zulu", "Mike", "Alpha"]);
  });

  it("keeps multi-digit decimal amount input editable and applies the range", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-11-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    for (const [title, amount] of [
      ["Large expense", 123456],
      ["Small expense", 9900],
    ] as const) {
      await transactions.create({
        title,
        occurredAt: "2026-11-26T09:30:00.000Z",
        currency: "INR",
        splits: [
          {
            id: crypto.randomUUID(),
            type: "expense",
            amount: toPaise(amount),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [],
        status: "cleared",
        note: "",
      });
    }

    const user = userEvent.setup();
    render(<TransactionsScreen />);
    await user.click(await screen.findByText("Search and filters"));
    const minimum = screen.getByLabelText("Minimum amount (INR)");
    await user.type(minimum, "abc1000.50");
    expect(minimum).toHaveValue("1000.50");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(
      await screen.findByRole("heading", { name: "Large expense" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Small expense")).not.toBeInTheDocument();

    await user.clear(minimum);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      await screen.findByRole("heading", { name: "Small expense" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Filtered total")).not.toBeInTheDocument();
  });

  it("matches any selected label", async () => {
    const accounts = createAccountRepository(db);
    const labels = createLabelRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-11-01T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const workLabel = await labels.create({ name: "Work", color: "#2563EB" });
    const homeLabel = await labels.create({ name: "Home", color: "#16A34A" });
    for (const { title, labelId } of [
      { title: "Work expense", labelId: workLabel.id },
      { title: "Home expense", labelId: homeLabel.id },
    ]) {
      await transactions.create({
        title,
        occurredAt: "2026-11-26T09:30:00.000Z",
        currency: "INR",
        splits: [
          {
            id: crypto.randomUUID(),
            type: "expense",
            amount: toPaise(100),
            accountId: account.id,
            note: "",
          },
        ],
        labelIds: [labelId],
        status: "cleared",
        note: "",
      });
    }

    const user = userEvent.setup();
    render(<TransactionsScreen />);
    await user.click(await screen.findByText("Search and filters"));
    await user.click(screen.getByText("All labels"));
    await user.click(screen.getByRole("checkbox", { name: "Work" }));
    await user.click(screen.getByRole("checkbox", { name: "Home" }));

    expect(
      await screen.findByRole("heading", { name: "Work expense" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Home expense" }),
    ).toBeInTheDocument();
    const workCheckbox = screen.getByRole("checkbox", { name: "Work" });
    const workDropdown = workCheckbox.closest("details");
    expect(workDropdown).toHaveAttribute("open");
    await user.click(screen.getByLabelText("Search"));
    expect(workDropdown).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Apply" }));
  });

  it("shows each transaction's balance after its own date's activity", async () => {
    const accounts = createAccountRepository(db);
    const transactions = createTransactionRepository(db);
    const account = await accounts.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(600000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await transactions.create({
      title: "Earlier expense",
      occurredAt: "2026-11-26T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(2000),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });
    await transactions.create({
      title: "Later expense",
      occurredAt: "2026-11-27T10:00:00.000Z",
      currency: "INR",
      splits: [
        {
          id: crypto.randomUUID(),
          type: "expense",
          amount: toPaise(200000),
          accountId: account.id,
          note: "",
        },
      ],
      labelIds: [],
      status: "cleared",
      note: "",
    });

    render(<TransactionsScreen />);

    const earlierRow = (
      await screen.findByRole("heading", { name: "Earlier expense" })
    ).closest("article");
    const laterRow = screen
      .getByRole("heading", { name: "Later expense" })
      .closest("article");
    expect(earlierRow).not.toBeNull();
    expect(laterRow).not.toBeNull();
    if (earlierRow && laterRow) {
      expect(within(earlierRow).getByText(/Wallet/)).toHaveTextContent(
        "(+₹5,980.00)",
      );
      expect(within(laterRow).getByText(/Wallet/)).toHaveTextContent(
        "(+₹3,980.00)",
      );
    }
  });
});
