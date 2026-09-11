import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValidationBadge } from "../../src/components/ValidationBadge";

describe("ValidationBadge", () => {
  it("renders Checked badge", () => {
    render(<ValidationBadge severity="good" />);
    expect(screen.getByText("Checked")).toBeInTheDocument();
  });

  it("renders Review badge", () => {
    render(<ValidationBadge severity="warning" />);
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("renders Needs attention badge", () => {
    render(<ValidationBadge severity="bad" />);
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("applies correct color class for good", () => {
    render(<ValidationBadge severity="good" />);
    const badge = screen.getByText("Checked");
    expect(badge.className).toContain("good");
  });
});

it("labels an incomplete inspection explicitly", () => {
  render(<ValidationBadge severity="unknown" />);
  expect(screen.getByText("Incomplete")).toHaveAttribute(
    "title",
    expect.stringContaining("Unknown does not mean passed")
  );
});
