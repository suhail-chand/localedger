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
      expect(screen.getByRole("heading", { name: "Salary" })).toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "Delete Wallet" }));
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete Wallet?",
    });
    await user.click(within(confirmation).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Wallet" }),
      ).not.toBeInTheDocument();
    });
  });
});
