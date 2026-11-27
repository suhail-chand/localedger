import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureDatabaseReady } from "@/data/db";
import {
  createCategoryGroupRepository,
  createCategoryRepository,
} from "@/data/repositories";
import { SEED_IDS } from "@/data/seed";
import { CategoriesScreen } from "./CategoriesScreen";

describe("CategoriesScreen", () => {
  beforeEach(async () => {
    await ensureDatabaseReady(db);
    await db.categoryGroups.clear();
    await db.categories.clear();
  });

  it("creates an income group and matching category", async () => {
    const user = userEvent.setup();
    render(<CategoriesScreen />);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    let dialog = screen.getByRole("dialog", { name: "Add category group" });
    await user.type(within(dialog).getByLabelText("Name"), "Salary");
    await user.selectOptions(within(dialog).getByLabelText("Kind"), "income");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await user.click(
      await screen.findByRole("button", { name: "Add category" }),
    );
    dialog = screen.getByRole("dialog", { name: "Add category" });
    await user.type(within(dialog).getByLabelText("Name"), "Pay");
    await user.selectOptions(within(dialog).getByLabelText("Kind"), "income");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Pay")).toBeInTheDocument();
    });
  });

  it("protects the built-in Other category from edit and delete", async () => {
    const groups = createCategoryGroupRepository(db);
    const categories = createCategoryRepository(db);
    await groups.create({ name: "Expenses", kind: "expense" });
    await categories.create({
      name: "Other",
      icon: "ellipsis",
      groupId: (await db.categoryGroups.toCollection().first())?.id ?? "",
      kind: "expense",
      builtIn: true,
    });
    render(<CategoriesScreen />);

    await screen.findByText("Other");
    expect(
      screen.queryByRole("button", { name: "Edit Other" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Other" }),
    ).not.toBeInTheDocument();
  });

  it("shows protected Other groups and categories for both kinds", async () => {
    const timestamp = "2026-11-26T10:00:00.000Z";
    await db.categoryGroups.bulkPut([
      {
        id: SEED_IDS.expenseOtherGroup,
        createdAt: timestamp,
        updatedAt: timestamp,
        deleted: false,
        name: "Other",
        kind: "expense",
      },
      {
        id: SEED_IDS.incomeOtherGroup,
        createdAt: timestamp,
        updatedAt: timestamp,
        deleted: false,
        name: "Other",
        kind: "income",
      },
    ]);
    await db.categories.bulkPut([
      {
        id: SEED_IDS.other,
        createdAt: timestamp,
        updatedAt: timestamp,
        deleted: false,
        name: "Other",
        icon: "ellipsis",
        groupId: SEED_IDS.expenseOtherGroup,
        kind: "expense",
        builtIn: true,
      },
      {
        id: SEED_IDS.incomeOther,
        createdAt: timestamp,
        updatedAt: timestamp,
        deleted: false,
        name: "Other",
        icon: "ellipsis",
        groupId: SEED_IDS.incomeOtherGroup,
        kind: "income",
        builtIn: true,
      },
    ]);
    render(<CategoriesScreen />);

    expect(await screen.findAllByText("Built-in")).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: "Edit Other" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Other" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit group Other" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete group Other" }),
    ).not.toBeInTheDocument();
  });

  it("blocks deleting a group that contains categories", async () => {
    const groups = createCategoryGroupRepository(db);
    const categories = createCategoryRepository(db);
    const group = await groups.create({ name: "Food", kind: "expense" });
    await categories.create({
      name: "Groceries",
      icon: "basket",
      groupId: group.id,
      kind: "expense",
    });
    const user = userEvent.setup();
    render(<CategoriesScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Delete group Food" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete Food?",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Delete" }),
    );

    expect(
      await within(confirmation).findByText(/Category group is in use/i),
    ).toBeInTheDocument();
  });
});
