import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import App from "../../src/App";
import { useFileTree, type FileTree } from "../../src/hooks/useFileTree";
import { inspectModel } from "../../src/lib/assetPipeline";
import { createTree, flattenTree, setChildren } from "../../src/lib/fileTree";
import type { AssetInfo } from "../../src/types/asset";

vi.mock("../../src/hooks/useFileTree", () => ({ useFileTree: vi.fn() }));
vi.mock("../../src/hooks/useFileDropHandler", () => ({ useFileDropHandler: vi.fn() }));
vi.mock("../../src/hooks/useBatchValidation", () => ({
  useBatchValidation: () => ({
    progress: { running: false, done: 0, total: 0, current: null },
    cancel: vi.fn(),
    run: vi.fn(),
  }),
}));
vi.mock("../../src/lib/assetPipeline", () => ({ inspectModel: vi.fn() }));
vi.mock("../../src/components/ModelLoader", () => ({
  clearPrefetch: vi.fn(),
  prefetchModel: vi.fn(),
  convertFilePath: (path: string) => path,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("../../src/components/Viewer3D", () => ({
  Viewer3D: ({
    filePath,
    onModelLoaded,
  }: {
    filePath: string;
    onModelLoaded: (model: unknown) => void;
  }) => (
    <button data-testid="preview-model" onClick={() => onModelLoaded({})}>
      {filePath}
    </button>
  ),
}));

const asset: AssetInfo = {
  fileName: "first.obj",
  filePath: "/models/first.obj",
  fileSize: 1024,
  format: "obj",
  polyCount: 12,
  vertexCount: 24,
  meshCount: 1,
  textures: [],
  missingTextures: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  const state = setChildren(
    createTree("/models"),
    null,
    ["first.obj", "second.obj"].map((name) => ({
      name,
      path: `/models/${name}`,
      isDir: false,
      fileSize: 1024,
      kind: "model" as const,
      hasChildren: false,
      thumbnailPath: null,
      modified: 0,
    }))
  );
  vi.mocked(useFileTree).mockReturnValue({
    state,
    rows: flattenTree(state),
    location: "/models",
    canGoUp: true,
    navigate: vi.fn(),
    navigateUp: vi.fn(),
    toggle: vi.fn(),
    setExpanded: vi.fn(),
    refresh: vi.fn(),
    modelsOnly: true,
    setModelsOnly: vi.fn(),
    sort: "name",
    setSort: vi.fn(),
    search: { active: false, query: "", results: [], searching: false, setQuery: vi.fn() },
    revealed: null,
    restoring: false,
    recentFolders: [],
  } satisfies FileTree);
  vi.mocked(inspectModel).mockResolvedValue({
    info: asset,
    validation: { overall: "good", items: [], groups: [] },
  });
});

describe("Workspace selection", () => {
  it("clears the previous inspection and export actions while the next model loads", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("first.obj"));
    fireEvent.click(screen.getByTestId("preview-model"));
    await screen.findByRole("complementary", { name: "Asset information" });
    fireEvent.click(screen.getByText("second.obj"));
    expect(
      screen.queryByRole("complementary", { name: "Asset information" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Thumbnail")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-model")).toHaveTextContent("/models/second.obj");
  });

  it("ignores an inspection that finishes after a new file was selected", async () => {
    let finish!: (result: Awaited<ReturnType<typeof inspectModel>>) => void;
    vi.mocked(inspectModel).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    render(<App />);
    fireEvent.click(screen.getByText("first.obj"));
    fireEvent.click(screen.getByTestId("preview-model"));
    fireEvent.click(screen.getByText("second.obj"));
    await act(async () =>
      finish({ info: asset, validation: { overall: "good", items: [], groups: [] } })
    );
    expect(
      screen.queryByRole("complementary", { name: "Asset information" })
    ).not.toBeInTheDocument();
  });

  it("uses arrow keys only while the file list has focus", () => {
    render(<App />);
    fireEvent.click(screen.getByText("first.obj"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Files" }), {
      key: "ArrowDown",
    });
    expect(screen.getByTestId("preview-model")).toHaveTextContent("/models/first.obj");
    fireEvent.keyDown(screen.getByRole("tree"), { key: "ArrowDown" });
    expect(screen.getByTestId("preview-model")).toHaveTextContent("/models/second.obj");
  });
});
