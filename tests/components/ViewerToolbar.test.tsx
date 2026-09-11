import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewerToolbar } from "../../src/components/ViewerToolbar";

const defaultProps = {
  viewMode: "default" as const,
  bgMode: "dark" as const,
  onViewModeChange: vi.fn(),
  onBgModeChange: vi.fn(),
  hasModel: true,
};

describe("ViewerToolbar", () => {
  it("renders nothing when hasModel is false", () => {
    const { container } = render(<ViewerToolbar {...defaultProps} hasModel={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders all 4 view mode buttons when hasModel is true", () => {
    render(<ViewerToolbar {...defaultProps} />);
    expect(screen.getByText("Solid")).toBeInTheDocument();
    expect(screen.getByText("Wire")).toBeInTheDocument();
    expect(screen.getByText("Normals")).toBeInTheDocument();
    expect(screen.getByText("UV")).toBeInTheDocument();
  });

  it("exposes the selected view mode to assistive technology", () => {
    render(<ViewerToolbar {...defaultProps} viewMode="wireframe" />);
    expect(screen.getByRole("button", { name: /Wire/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Solid/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onViewModeChange when a view mode button is clicked", () => {
    const onViewModeChange = vi.fn();
    render(<ViewerToolbar {...defaultProps} onViewModeChange={onViewModeChange} />);
    fireEvent.click(screen.getByText("Normals"));
    expect(onViewModeChange).toHaveBeenCalledWith("normals");
  });

  it("renders 3 background color buttons", () => {
    render(<ViewerToolbar {...defaultProps} />);
    const bgButtons = ["dark", "neutral", "light"].map((mode) => screen.getByTitle(mode));
    expect(bgButtons).toHaveLength(3);
    bgButtons.forEach((btn) => expect(btn).toBeInTheDocument());
  });

  it("calls onBgModeChange when a background button is clicked", () => {
    const onBgModeChange = vi.fn();
    render(<ViewerToolbar {...defaultProps} onBgModeChange={onBgModeChange} />);
    fireEvent.click(screen.getByTitle("light"));
    expect(onBgModeChange).toHaveBeenCalledWith("light");
  });
});
