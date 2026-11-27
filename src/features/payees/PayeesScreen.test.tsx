import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureDatabaseReady } from "@/data/db";
import {
  createPayeeGroupRepository,
  createPayeeRepository,
} from "@/data/repositories";
import { SEED_IDS } from "@/data/seed";
import { PayeesScreen } from "./PayeesScreen";

describe("PayeesScreen", () => {
  beforeEach(async () => {
    await ensureDatabaseReady(db);
    await db.payeeGroups.clear();
    await db.payees.clear();
  });

  it("creates a payee group and assigns a payee to it", async () => {
    const user = userEvent.setup();
    render(<PayeesScreen />);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    let dialog = screen.getByRole("dialog", { name: "Add payee group" });
    await user.type(within(dialog).getByLabelText("Name"), "Shops");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await user.click(await screen.findByRole("button", { name: "Add payee" }));
    dialog = screen.getByRole("dialog", { name: "Add payee" });
    await user.type(within(dialog).getByLabelText("Name"), "Market");
    const group = await db.payeeGroups.toCollection().first();
    if (!group) throw new Error("Payee group was not created");
    await user.selectOptions(within(dialog).getByLabelText("Group"), group.id);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Market")).toBeInTheDocument();
    });
  });

  it("protects the built-in Unspecified payee", async () => {
    await db.payees.put({
      id: SEED_IDS.unspecified,
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
      deleted: false,
      name: "Unspecified",
      builtIn: true,
    });
    render(<PayeesScreen />);

    await screen.findByText("Unspecified");
    expect(
      screen.queryByRole("button", { name: "Edit Unspecified" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Unspecified" }),
    ).not.toBeInTheDocument();
  });

  it("blocks deleting a group that contains payees", async () => {
    const groups = createPayeeGroupRepository(db);
    const payees = createPayeeRepository(db);
    const group = await groups.create({ name: "Shops" });
    await payees.create({ name: "Market", groupId: group.id });
    const user = userEvent.setup();
    render(<PayeesScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Delete group Shops" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete Shops?",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Delete" }),
    );

    expect(
      await within(confirmation).findByText(/Payee group is in use/i),
    ).toBeInTheDocument();
  });
});
