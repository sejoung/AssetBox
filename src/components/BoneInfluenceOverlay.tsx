import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { createBoneInfluenceOverlay, type BoneSelection } from "../lib/boneInfluence";

export function BoneInfluenceOverlay({ selection }: { selection: BoneSelection }) {
  const host = useRef<THREE.Group>(null);
  const overlay = useRef<ReturnType<typeof createBoneInfluenceOverlay> | null>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const current = createBoneInfluenceOverlay(selection);
    overlay.current = current;
    current.update();
    container.add(current.group);
    return () => {
      container.remove(current.group);
      current.dispose();
      overlay.current = null;
    };
  }, [selection]);
  useFrame(() => overlay.current?.update());
  return <group ref={host} />;
}
