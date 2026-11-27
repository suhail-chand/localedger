import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleForm } from "./ScheduleForm";

describe("ScheduleForm", () => {
  it("renders a title and schedule type control", () => {
    render(
      <ScheduleForm
        accounts={[]}
        categoryGroups={[]}
        categories={[]}
        payeeGroups={[]}
        payees={[]}
        labels={[]}
        onSubmit={vi.fn()}
        onEmiSubmit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Schedule type")).toBeInTheDocument();
  });
});
