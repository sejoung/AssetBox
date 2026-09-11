import { expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBatchValidation } from "../../src/hooks/useBatchValidation";
vi.mock("../../src/hooks/useTauriCommand", () => ({
  listDirectory: vi.fn(async () => [
    { path: "/model.glb", name: "model.glb", kind: "model", isDir: false },
  ]),
}));
vi.mock("../../src/components/ModelLoader", () => ({
  loadModel: vi.fn(async () => {
    throw new Error("Unreadable model");
  }),
}));
it("records a failed batch inspection as incomplete", async () => {
  const onResult = vi.fn();
  const { result } = renderHook(() => useBatchValidation(onResult));
  await act(async () => {
    await result.current.run("/");
  });
  expect(onResult).toHaveBeenCalledWith("/model.glb", "unknown");
  expect(result.current.progress.running).toBe(false);
});
