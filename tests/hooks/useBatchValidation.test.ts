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

it("does not publish a pending result after cancellation and releases its scene", async () => {
  const { loadModel } = await import("../../src/components/ModelLoader");
  const THREE = await import("three");
  // The loader is deferred to simulate a source edit while parsing a model.
  let finish!: (value: Awaited<ReturnType<typeof loadModel>>) => void;
  vi.mocked(loadModel).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const onResult = vi.fn();
  const geometry = new THREE.BoxGeometry();
  const disposed = vi.fn();
  geometry.addEventListener("dispose", disposed);
  const scene = new THREE.Group().add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  const { result } = renderHook(() => useBatchValidation(onResult));
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.run("/");
  });
  act(() => result.current.cancel());
  await act(async () => {
    finish({ scene } as Awaited<ReturnType<typeof loadModel>>);
    await pending;
  });
  expect(onResult).not.toHaveBeenCalled();
  expect(disposed).toHaveBeenCalledOnce();
  expect(result.current.progress.running).toBe(false);
});
