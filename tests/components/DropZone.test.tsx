import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DropZone } from "../../src/components/DropZone";

describe("DropZone", () => {
  it("renders the drop prompt when no file is loaded", () => {
    render(<DropZone onFileDrop={vi.fn()} hasFile={false} />);
    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument();
  });

  it("hides drop prompt when a file is loaded", () => {
    render(<DropZone onFileDrop={vi.fn()} hasFile={true} />);
    expect(screen.queryByText(/drag & drop/i)).not.toBeInTheDocument();
  });

  it("shows visual feedback on dragover", () => {
    render(<DropZone onFileDrop={vi.fn()} hasFile={false} />);
    const zone = screen.getByTestId("drop-zone");
    fireEvent.dragOver(zone);
    expect(zone.className).toContain("drag-over");
  });

  it("calls onFileDrop with file paths on drop", () => {
    const onFileDrop = vi.fn();
    render(<DropZone onFileDrop={onFileDrop} hasFile={false} />);
    const zone = screen.getByTestId("drop-zone");

    const file = new File([""], "model.glb", { type: "model/gltf-binary" });
    fireEvent.drop(zone, {
      dataTransfer: { files: [file] },
    });

    expect(onFileDrop).toHaveBeenCalledTimes(1);
  });

  it("shows supported formats text", () => {
    render(<DropZone onFileDrop={vi.fn()} hasFile={false} />);
    expect(screen.getByText(/FBX.*GLB.*OBJ/i)).toBeInTheDocument();
  });
});
