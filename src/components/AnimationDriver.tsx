import { useFrame } from "@react-three/fiber";
import type { AnimationPlayback } from "../lib/animationPlayback";

export function AnimationDriver({
  player,
  enabled,
}: {
  player: AnimationPlayback;
  enabled: boolean;
}) {
  // Deform before controls (-1), clipping, bone overlays and rendering (0).
  useFrame((_, delta) => {
    if (enabled) player.update(delta);
  }, -2);
  return null;
}
