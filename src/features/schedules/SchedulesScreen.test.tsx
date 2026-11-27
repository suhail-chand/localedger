import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SchedulesScreen } from "@/features/schedules/SchedulesScreen";

describe("SchedulesScreen", () => {
  it("shows an empty state and disables export", () => {
    render(<SchedulesScreen />);

    expect(screen.getByText("No scheduled transactions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export .ics" })).toBeDisabled();
  });
});
