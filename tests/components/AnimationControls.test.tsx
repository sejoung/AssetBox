import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import * as THREE from "three";
import { AnimationControls } from "../../src/components/AnimationControls";
import { AnimationPlayback } from "../../src/lib/animationPlayback";

function player() {
  const model = new THREE.Group();
  model.animations = [
    new THREE.AnimationClip("Walk", 2, [
      new THREE.NumberKeyframeTrack(".position[x]", [0, 2], [0, 1]),
    ]),
  ];
  return new AnimationPlayback(model);
}

it("selects and controls clips through labeled inputs, with scrubbing pausing playback", () => {
  const current = player();
  render(<AnimationControls player={current} />);
  fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
  expect(screen.getByRole("combobox", { name: "Animation clip" })).toHaveValue("0");
  expect(screen.getByRole("button", { name: "Pause animation" })).toBeEnabled();
  fireEvent.change(screen.getByRole("slider", { name: "Animation time" }), {
    target: { value: "1.25" },
  });
  expect(current.getSnapshot()).toMatchObject({ time: 1.25, playing: false });
  fireEvent.change(screen.getByRole("combobox", { name: "Playback speed" }), {
    target: { value: "0.5" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Loop" }));
  expect(current.getSnapshot()).toMatchObject({ speed: 0.5, loop: false });
  fireEvent.click(screen.getByRole("button", { name: "Reset pose" }));
  expect(screen.getByRole("combobox", { name: "Animation clip" })).toHaveValue("-1");
  expect(screen.getByRole("slider")).toBeDisabled();
});

it("explains unavailable playback and hides controls for static models", () => {
  const { rerender } = render(
    <AnimationControls player={player()} disabledReason="Switch to Solid to preview animation." />
  );
  expect(screen.getByText("Switch to Solid to preview animation.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Play animation" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Animation clip" })).toBeDisabled();
  rerender(<AnimationControls player={new AnimationPlayback(new THREE.Group())} />);
  expect(screen.queryByRole("region", { name: "Animation preview" })).not.toBeInTheDocument();
});
