import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureDatabaseReady } from "@/data/db";
import { createAccountRepository } from "@/data/repositories";
import { toPaise } from "@/domain/money";
import { AccountsScreen } from "./AccountsScreen";

describe("AccountsScreen", () => {
  beforeEach(async () => {
    await ensureDatabaseReady(db);
    await db.accounts.clear();
    await db.transactions.clear();
    await db.scheduledTransactions.clear();
  });

  it("shows a negative account balance with a minus sign", async () => {
    const repository = createAccountRepository(db);
    await repository.create({
      name: "Credit card",
      type: "credit_card",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(-12345),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    render(<AccountsScreen />);

    expect((await screen.findAllByText("-₹123.45")).length).toBeGreaterThan(0);
  });

  it("shows a positive account balance with a plus sign", async () => {
    const repository = createAccountRepository(db);
    await repository.create({
      name: "Wallet",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(123450),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    render(<AccountsScreen />);

    expect((await screen.findAllByText("+₹1,234.50")).length).toBeGreaterThan(
      0,
    );
  });

  it("shows assets, liabilities, net worth and account-type totals", async () => {
    const repository = createAccountRepository(db);
    await repository.create({
      name: "Savings",
      type: "savings",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(150000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await repository.create({
      name: "Home loan",
      type: "loan",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(-50000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    await repository.create({
      name: "Private fund",
      type: "cash",
      openingDate: "2026-01-01T00:00:00.000Z",
      startingBalance: toPaise(250000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: true,
    });

    render(<AccountsScreen />);

    const assetsLabel = await screen.findByText("Total assets");
    const liabilitiesLabel = screen.getByText("Total liabilities");
    const netWorthLabel = screen.getByText("Net worth");
    expect(assetsLabel.parentElement).toHaveTextContent("₹1,500.00");
    expect(liabilitiesLabel.parentElement).toHaveTextContent("₹500.00");
    expect(netWorthLabel.parentElement).toHaveTextContent("+₹1,000.00");

    const savingsHeading = screen.getByRole("heading", {
      name: "Savings / Bank",
    });
    const savingsSection = savingsHeading.closest("section");
    expect(savingsSection).not.toBeNull();
    expect(savingsSection).toHaveTextContent("Total");
    expect(savingsSection).toHaveTextContent("+₹1,500.00");

    const loanHeading = screen.getByRole("heading", { name: "Loan" });
    const loanSection = loanHeading.closest("section");
    expect(loanSection).not.toBeNull();
    expect(loanSection).toHaveTextContent("Total");
    expect(loanSection).toHaveTextContent("-₹500.00");
  });

  it("shows a clear error when account data is corrupt", async () => {
    await db.accounts.put({
      id: "40000000-0000-4000-8000-000000000499",
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
      deleted: false,
      name: "",
      type: "cash",
      openingDate: "2026-11-26T00:00:00.000Z",
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });

    render(<AccountsScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load accounts",
    );
  });

  it("creates an account and shows its derived balance", async () => {
    const user = userEvent.setup();
    render(<AccountsScreen />);

    await user.click(screen.getByRole("button", { name: "Add account" }));
    const dialog = screen.getByRole("dialog", { name: "Add account" });
    await user.type(within(dialog).getByLabelText("Name"), "Salary");
    await user.selectOptions(within(dialog).getByLabelText("Type"), "savings");
    await user.clear(within(dialog).getByLabelText("Starting balance (INR)"));
    await user.type(
      within(dialog).getByLabelText("Starting balance (INR)"),
      "1234.50",
    );
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Salary");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Salary" }),
      ).toBeInTheDocument();
    });
    expect(await db.accounts.count()).toBe(1);
  });

  it("edits account flags", async () => {
    const repository = createAccountRepository(db);
    const account = await repository.create({
      name: "Cash",
      type: "cash",
      openingDate: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      startingBalance: toPaise(10000),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const user = userEvent.setup();
    render(<AccountsScreen />);

    await user.click(await screen.findByRole("button", { name: "Edit Cash" }));
    const dialog = screen.getByRole("dialog", { name: "Edit account" });
    await user.click(
      within(dialog).getByLabelText("Hide from transaction selection"),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect((await repository.get(account.id))?.hideFromTransactions).toBe(
        true,
      );
    });
  });

  it("soft-deletes an unused account after confirmation", async () => {
    const repository = createAccountRepository(db);
    await repository.create({
      name: "Wallet",
      type: "cash",
      openingDate: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      startingBalance: toPaise(0),
      currency: "INR",
      note: "",
      hideFromTransactions: false,
      hideFromReports: false,
    });
    const user = userEvent.setup();
    render(<AccountsScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Delete Wallet" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete Wallet?",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Wallet" }),
      ).not.toBeInTheDocument();
    });
  });
});
