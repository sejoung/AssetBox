import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ReportButton } from "../../src/components/ReportButton";
import type { AssetInfo, ValidationResult } from "../../src/types/asset";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockAsset: AssetInfo = {
  fileName: "test.glb",
  filePath: "/models/test.glb",
  fileSize: 1024,
  format: "glb",
  polyCount: 100,
  vertexCount: 50,
  meshCount: 1,
  textures: [],
  missingTextures: [],
};

const mockValidation: ValidationResult = {
  overall: "good",
  items: [],
  groups: [],
};

describe("ReportButton", () => {
  it('renders "Report" button text when idle', () => {
    render(<ReportButton asset={mockAsset} validation={mockValidation} />);
    expect(screen.getByRole("button", { name: /report/i })).toBeInTheDocument();
  });

  it("button is disabled when asset is null", () => {
    render(<ReportButton asset={null} validation={mockValidation} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("button is disabled when validation is null", () => {
    render(<ReportButton asset={mockAsset} validation={null} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it('calls invoke("save_text_file") when clicked with valid asset and validation', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    render(<ReportButton asset={mockAsset} validation={mockValidation} />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));

    await waitFor(() => {

      expect(invoke).toHaveBeenCalledWith("save_text_file", {
        content: expect.any(String),
        outputPath: "/models/test_report.html",
      });
    });
  });
});
