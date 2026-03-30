import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfoPanel } from "../../src/components/InfoPanel";
import type { AssetInfo, ValidationResult } from "../../src/types/asset";
import { createRef } from "react";
import type { Viewer3DHandle } from "../../src/components/Viewer3D";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const mockViewerRef = createRef<Viewer3DHandle>();

const mockAssetInfo: AssetInfo = {
  fileName: "hero_character.glb",
  filePath: "/models/hero_character.glb",
  fileSize: 2_500_000,
  format: "glb",
  polyCount: 12500,
  vertexCount: 8300,
  meshCount: 3,
  textures: [
    {
      type: "basecolor",
      fileName: "hero_basecolor.png",
      filePath: "/models/hero_basecolor.png",
      resolution: { width: 2048, height: 2048 },
    },
    {
      type: "normal",
      fileName: "hero_normal.png",
      filePath: "/models/hero_normal.png",
      resolution: { width: 2048, height: 2048 },
    },
  ],
  missingTextures: ["roughness"],
};

const mockValidation: ValidationResult = {
  overall: "good",
  items: [
    { label: "Tris", value: "12.5K", severity: "good", category: "geometry" },
    { label: "Meshes", value: "3", severity: "good", category: "geometry" },
  ],
  groups: [
    {
      category: "geometry",
      label: "Geometry",
      items: [
        { label: "Tris", value: "12.5K", severity: "good", category: "geometry" },
        { label: "Meshes", value: "3", severity: "good", category: "geometry" },
      ],
    },
  ],
};

const defaultProps = {
  viewerRef: mockViewerRef,
  assetPath: "/models/hero_character.glb",
};

describe("InfoPanel", () => {
  it("displays asset file name", () => {
    render(<InfoPanel asset={mockAssetInfo} validation={mockValidation} {...defaultProps} />);
    expect(screen.getByText("hero_character.glb")).toBeInTheDocument();
  });

  it("displays mesh count", () => {
    render(<InfoPanel asset={mockAssetInfo} validation={mockValidation} {...defaultProps} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("displays format", () => {
    render(<InfoPanel asset={mockAssetInfo} validation={mockValidation} {...defaultProps} />);
    expect(screen.getAllByText(/glb/i).length).toBeGreaterThanOrEqual(1);
  });

  it("displays category headers", () => {
    render(<InfoPanel asset={mockAssetInfo} validation={mockValidation} {...defaultProps} />);
    expect(screen.getByText("Geometry")).toBeInTheDocument();
  });

  it("lists textures", () => {
    render(<InfoPanel asset={mockAssetInfo} validation={mockValidation} {...defaultProps} />);
    expect(screen.getByText("hero_basecolor.png")).toBeInTheDocument();
    expect(screen.getByText("hero_normal.png")).toBeInTheDocument();
  });

  it("shows nothing when no asset", () => {
    const { container } = render(<InfoPanel asset={null} validation={null} {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });
});
