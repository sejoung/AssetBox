import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import type { Viewer3DHandle } from "../../src/components/Viewer3D";
import { ThumbnailButton } from "../../src/components/ThumbnailButton";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";

describe("ThumbnailButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Thumbnail" text when idle', () => {
    const emptyRef = createRef<Viewer3DHandle>();
    render(<ThumbnailButton viewerRef={emptyRef} assetPath="/test.glb" />);
    expect(screen.getByText("Thumbnail")).toBeInTheDocument();
  });

  it("button is disabled when assetPath is null", () => {
    const emptyRef = createRef<Viewer3DHandle>();
    render(<ThumbnailButton viewerRef={emptyRef} assetPath={null} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls viewerRef.captureScreenshot and invoke when clicked", async () => {
    const mockRef = {
      current: { captureScreenshot: vi.fn(() => "data:image/png;base64,abc") },
    };
    vi.mocked(invoke).mockResolvedValue(undefined);

    render(
      <ThumbnailButton
        viewerRef={mockRef as unknown as React.RefObject<Viewer3DHandle>}
        assetPath="/models/test.glb"
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockRef.current.captureScreenshot).toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledWith("save_thumbnail", {
        imageData: "data:image/png;base64,abc",
        outputPath: "/models/test_thumbnail.png",
      });
    });
  });
});
