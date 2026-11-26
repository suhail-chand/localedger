import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureDatabaseReady } from "@/data/db";
import { LabelsScreen } from "./LabelsScreen";

describe("LabelsScreen", () => {
  beforeEach(async () => {
    await ensureDatabaseReady(db);
    await db.labels.clear();
  });

  it("creates and edits a label", async () => {
    const user = userEvent.setup();
    render(<LabelsScreen />);

    await user.click(screen.getByRole("button", { name: "Add label" }));
    let dialog = screen.getByRole("dialog", { name: "Add label" });
    await user.type(within(dialog).getByLabelText("Name"), "Travel");
    await user.clear(within(dialog).getByLabelText("Hex colour"));
    await user.type(within(dialog).getByLabelText("Hex colour"), "#123456");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Travel")).toBeInTheDocument();
    });
    expect(await db.labels.toCollection().first()).toMatchObject({
      name: "Travel",
      color: "#123456",
    });

    await user.click(screen.getByRole("button", { name: "Edit Travel" }));
    dialog = screen.getByRole("dialog", { name: "Edit label" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Holiday");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Holiday")).toBeInTheDocument();
    });
  });

  it("rejects an invalid hex colour", async () => {
    const user = userEvent.setup();
    render(<LabelsScreen />);

    await user.click(screen.getByRole("button", { name: "Add label" }));
    const dialog = screen.getByRole("dialog", { name: "Add label" });
    await user.type(within(dialog).getByLabelText("Name"), "Invalid");
    await user.clear(within(dialog).getByLabelText("Hex colour"));
    await user.type(within(dialog).getByLabelText("Hex colour"), "red");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("soft deletes a label", async () => {
    const user = userEvent.setup();
    await db.labels.put({
      id: "40000000-0000-4000-8000-000000000401",
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
      deleted: false,
      name: "Travel",
      color: "#123456",
    });
    render(<LabelsScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Delete Travel" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete Travel?",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Travel")).not.toBeInTheDocument();
    });
    expect(
      await db.labels.get("40000000-0000-4000-8000-000000000401"),
    ).toMatchObject({ deleted: true });
  });
});
