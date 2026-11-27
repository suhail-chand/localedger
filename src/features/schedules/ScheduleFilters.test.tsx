import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScheduleFilters } from "./ScheduleFilters";

describe("ScheduleFilters", () => {
  it("updates search and clears filters", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleFilters filters={{ sort: "next_due" }} onChange={onChange} />,
    );

    await user.type(screen.getByRole("searchbox"), "rent");
    expect(onChange).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenLastCalledWith({ sort: "next_due" });
  });
});
