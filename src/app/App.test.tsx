import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the Localedger app shell and persistent-storage status", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Localedger" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /Persistent storage: (granted|denied|unsupported|error)/,
      );
    });
  });
});
