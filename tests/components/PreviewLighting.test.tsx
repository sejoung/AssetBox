import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Scene, Texture } from "three";
import { PreviewLighting } from "../../src/components/PreviewLighting";

const mocks = vi.hoisted(() => ({
  fromScene: vi.fn(),
  disposeGenerator: vi.fn(),
  disposeRoom: vi.fn(),
  invalidate: vi.fn(),
  state: {} as Record<string, unknown>,
}));
vi.mock("@react-three/fiber", () => ({ useThree: () => mocks.state }));
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  PMREMGenerator: class {
    fromScene = mocks.fromScene;
    dispose = mocks.disposeGenerator;
  },
}));
vi.mock("three/examples/jsm/environments/RoomEnvironment.js", () => ({
  RoomEnvironment: class {
    dispose = mocks.disposeRoom;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { gl: {}, scene: new Scene(), invalidate: mocks.invalidate };
});

it("keeps locally generated lighting active across Strict Mode setup/cleanup and releases each target", () => {
  const scene = mocks.state.scene as Scene;
  const previous = new Texture();
  scene.environment = previous;
  const targets: { texture: Texture; dispose: ReturnType<typeof vi.fn> }[] = [];
  mocks.fromScene.mockImplementation(() => {
    const target = { texture: new Texture(), dispose: vi.fn() };
    targets.push(target);
    return target;
  });
  const { unmount } = render(
    <StrictMode>
      <PreviewLighting />
    </StrictMode>
  );
  expect(targets.length).toBeGreaterThan(1);
  const activeTarget = targets[targets.length - 1];
  expect(scene.environment).toBe(activeTarget.texture);
  expect(targets[0].dispose).toHaveBeenCalledTimes(1);
  expect(activeTarget.dispose).not.toHaveBeenCalled();
  expect(mocks.invalidate).toHaveBeenCalled();
  unmount();
  expect(scene.environment).toBe(previous);
  for (const target of targets) expect(target.dispose).toHaveBeenCalledTimes(1);
  expect(mocks.disposeRoom).toHaveBeenCalledTimes(targets.length);
  expect(mocks.disposeGenerator).toHaveBeenCalledTimes(targets.length);
});
