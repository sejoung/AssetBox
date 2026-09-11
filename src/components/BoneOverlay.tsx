import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { createBoneOverlay } from "../lib/boneOverlay";

export function BoneOverlay({ model }: { model: THREE.Group }) {
  const host = useRef<THREE.Group>(null);
  const overlay = useRef<ReturnType<typeof createBoneOverlay> | null>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const current = createBoneOverlay(model);
    overlay.current = current;
    current.update();
    container.add(current.group);
    return () => {
      container.remove(current.group);
      current.dispose();
      overlay.current = null;
    };
  }, [model]);
  // World coordinates include Center's parent transform and detached skin joints.
  useFrame(() => overlay.current?.update());
  return <group ref={host} />;
}
