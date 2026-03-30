import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValidationBadge } from "../../src/components/ValidationBadge";

describe("ValidationBadge", () => {
  it("renders Good badge", () => {
    render(<ValidationBadge severity="good" />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("renders Warning badge", () => {
    render(<ValidationBadge severity="warning" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("renders Bad badge", () => {
    render(<ValidationBadge severity="bad" />);
    expect(screen.getByText("Bad")).toBeInTheDocument();
  });

  it("applies correct color class for good", () => {
    render(<ValidationBadge severity="good" />);
    const badge = screen.getByText("Good");
    expect(badge.className).toContain("good");
  });
});
