import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RiggingPanel } from "../../src/components/RiggingPanel";
import type { RiggingInfo } from "../../src/types/asset";
const rig: RiggingInfo = {
  skeletonCount: 1,
  bones: [
    { id: "1", name: "Hips", parentId: null },
    { id: "2", name: "Spine", parentId: "1" },
  ],
  skins: [
    {
      id: "mesh",
      name: "Body",
      boneCount: 2,
      vertexCount: 24,
      maxInfluences: 2,
      unweightedVertices: 0,
      invalidInfluenceVertices: 0,
    },
  ],
  clips: [{ id: "clip", name: "Idle", duration: 1.5, trackCount: 1 }],
};
it("shows rig metadata, searches bones and toggles the overlay", () => {
  const toggle = vi.fn();
  render(
    <RiggingPanel rigging={rig} format="glb" bonesVisible={false} onBonesVisibleChange={toggle} />
  );
  expect(screen.getByText("Skinned")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Bone hierarchy"));
  expect(
    within(screen.getByRole("list", { name: "Bone hierarchy" })).getAllByRole("listitem")
  ).toHaveLength(2);
  fireEvent.change(screen.getByRole("textbox", { name: "Find bone" }), {
    target: { value: "spine" },
  });
  expect(
    within(screen.getByRole("list", { name: "Bone hierarchy" })).getAllByRole("listitem")
  ).toHaveLength(1);
  fireEvent.click(screen.getByText("Animation clips"));
  expect(screen.getByText("Idle")).toBeVisible();
  expect(screen.getByText("1.5 s · 1 track")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Show bones" }));
  expect(toggle).toHaveBeenCalledWith(true);
});
it("distinguishes unsupported OBJ from exported bone data", () => {
  render(
    <RiggingPanel
      rigging={{ skeletonCount: 0, bones: [], skins: [], clips: [] }}
      format="obj"
      bonesVisible={false}
    />
  );
  expect(screen.getByText(/OBJ does not store bones/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show bones" })).not.toBeInTheDocument();
  expect(screen.getByText("Not found")).toBeInTheDocument();
});
