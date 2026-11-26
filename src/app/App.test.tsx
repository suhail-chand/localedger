import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the Localedger app shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Localedger" }),
    ).toBeInTheDocument();
  });
});
