import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const scheduleEvaluation = vi.hoisted(() => ({
  evaluateSchedules: vi.fn(() =>
    Promise.resolve({
      schedulesEvaluated: 0,
      transactionsRecorded: 0,
      occurrencesSkipped: 0,
    }),
  ),
}));

vi.mock("@/data/scheduleEvaluation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/data/scheduleEvaluation")>();
  return {
    ...actual,
    evaluateSchedules: scheduleEvaluation.evaluateSchedules,
  };
});

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/");
    scheduleEvaluation.evaluateSchedules.mockClear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("opens the transactions screen by default and shows persistent-storage status", async () => {
    render(<App />);

    expect(
      screen.getAllByRole("heading", { name: "Transactions" }).length,
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

    const accountsLink = screen
      .getAllByRole("link", { name: "Accounts" })
      .at(0);
    if (!accountsLink)
      throw new Error("Accounts navigation link was not rendered");
    await user.click(accountsLink);

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

  it("navigates to payees and opens the add sheet", async () => {
    const user = userEvent.setup();
    render(<App />);

    const payeesLink = screen.getAllByRole("link", { name: "Payees" }).at(0);
    if (!payeesLink) throw new Error("Payees navigation link was not rendered");
    await user.click(payeesLink);
    expect(
      screen.getAllByRole("heading", { name: "Payees" }).length,
    ).toBeGreaterThan(0);

    const addPayeeButton = screen
      .getAllByRole("button", { name: "Add payee" })
      .at(0);
    if (!addPayeeButton) {
      throw new Error("Add payee button was not rendered");
    }
    await user.click(addPayeeButton);
    expect(
      screen.getByRole("dialog", { name: "Add payee" }),
    ).toBeInTheDocument();
  });

  it("redirects unknown hash routes to transactions", async () => {
    window.history.replaceState(null, "", "#/unknown");
    render(<App />);

    expect(
      screen.getAllByRole("heading", { name: "Transactions" }).length,
    ).toBeGreaterThan(0);
  });

  it("evaluates schedules on open and on foreground", async () => {
    render(<App />);

    await waitFor(() => {
      expect(scheduleEvaluation.evaluateSchedules).toHaveBeenCalled();
    });
    const initialCalls = scheduleEvaluation.evaluateSchedules.mock.calls.length;

    fireEvent(window, new Event("focus"));
    await waitFor(() => {
      expect(scheduleEvaluation.evaluateSchedules).toHaveBeenCalledTimes(
        initialCalls + 1,
      );
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => {
      expect(scheduleEvaluation.evaluateSchedules).toHaveBeenCalledTimes(
        initialCalls + 2,
      );
    });
  });

  it("evaluates schedules after schedule changes and shows failures", async () => {
    scheduleEvaluation.evaluateSchedules.mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Schedule evaluation failed: IndexedDB unavailable",
    );

    scheduleEvaluation.evaluateSchedules.mockResolvedValueOnce({
      schedulesEvaluated: 0,
      transactionsRecorded: 0,
      occurrencesSkipped: 0,
    });
    fireEvent(window, new Event("localedger:schedules-changed"));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
