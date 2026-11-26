import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/");
  });

  it("opens the accounts screen by default and shows persistent-storage status", async () => {
    render(<App />);

    expect(
      screen.getAllByRole("heading", { name: "Accounts" }).length,
    ).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    });
  });

  it("navigates to labels and opens the add sheet", async () => {
    const user = userEvent.setup();
    render(<App />);

    const labelsLink = screen.getAllByRole("link", { name: "Labels" }).at(0);
    if (!labelsLink) throw new Error("Labels navigation link was not rendered");
    await user.click(labelsLink);
    expect(
      screen.getAllByRole("heading", { name: "Labels" }).length,
    ).toBeGreaterThan(0);

    const addLabelButton = screen
      .getAllByRole("button", { name: "Add label" })
      .at(0);
    if (!addLabelButton) throw new Error("Add label button was not rendered");
    await user.click(addLabelButton);
    expect(
      screen.getByRole("dialog", { name: "Add label" }),
    ).toBeInTheDocument();
  });

  it("opens the account sheet and validates account fields", async () => {
    const user = userEvent.setup();
    render(<App />);

    const addAccountButton = screen
      .getAllByRole("button", { name: "Add account" })
      .at(0);
    if (!addAccountButton) {
      throw new Error("Add account button was not rendered");
    }
    await user.click(addAccountButton);
    const sheet = screen.getByRole("dialog", { name: "Add account" });
    expect(within(sheet).getByLabelText("Name")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(sheet).getByRole("alert")).toBeInTheDocument();
  });

  it("redirects unknown hash routes to accounts", async () => {
    window.history.replaceState(null, "", "#/unknown");
    render(<App />);

    expect(
      screen.getAllByRole("heading", { name: "Accounts" }).length,
    ).toBeGreaterThan(0);
  });
});
