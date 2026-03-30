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
    const { container } = render(
      <ViewerToolbar {...defaultProps} hasModel={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders all 4 view mode buttons when hasModel is true", () => {
    render(<ViewerToolbar {...defaultProps} />);
    expect(screen.getByText("Solid")).toBeInTheDocument();
    expect(screen.getByText("Wire")).toBeInTheDocument();
    expect(screen.getByText("Normals")).toBeInTheDocument();
    expect(screen.getByText("UV")).toBeInTheDocument();
  });

  it("active button has accent color #e94560 styling", () => {
    render(<ViewerToolbar {...defaultProps} viewMode="wireframe" />);
    const wireBtn = screen.getByText("Wire").closest("button")!;
    // Browser normalizes hex to rgb
    expect(wireBtn.style.color).toBe("rgb(233, 69, 96)");
    expect(wireBtn.style.border).toContain("rgb(233, 69, 96)");

    const solidBtn = screen.getByText("Solid").closest("button")!;
    expect(solidBtn.style.color).not.toBe("rgb(233, 69, 96)");
  });

  it("calls onViewModeChange when a view mode button is clicked", () => {
    const onViewModeChange = vi.fn();
    render(
      <ViewerToolbar {...defaultProps} onViewModeChange={onViewModeChange} />,
    );
    fireEvent.click(screen.getByText("Normals"));
    expect(onViewModeChange).toHaveBeenCalledWith("normals");
  });

  it("renders 3 background color buttons", () => {
    render(<ViewerToolbar {...defaultProps} />);
    const bgButtons = ["dark", "neutral", "light"].map((mode) =>
      screen.getByTitle(mode),
    );
    expect(bgButtons).toHaveLength(3);
    bgButtons.forEach((btn) => expect(btn).toBeInTheDocument());
  });

  it("calls onBgModeChange when a background button is clicked", () => {
    const onBgModeChange = vi.fn();
    render(
      <ViewerToolbar {...defaultProps} onBgModeChange={onBgModeChange} />,
    );
    fireEvent.click(screen.getByTitle("light"));
    expect(onBgModeChange).toHaveBeenCalledWith("light");
  });
});
