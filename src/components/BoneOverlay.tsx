import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { createBoneOverlay } from "../lib/boneOverlay";

export function BoneOverlay({
  model,
  selectedBoneId,
  onSelectBone,
}: {
  model: THREE.Group;
  selectedBoneId?: string;
  onSelectBone?: (id: string) => void;
}) {
  const host = useRef<THREE.Group>(null);
  const overlay = useRef<ReturnType<typeof createBoneOverlay> | null>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const current = createBoneOverlay(model, selectedBoneId);
    overlay.current = current;
    current.update();
    container.add(current.group);
    return () => {
      container.remove(current.group);
      current.dispose();
      overlay.current = null;
    };
  }, [model, selectedBoneId]);
  // World coordinates include Center's parent transform and detached skin joints.
  useFrame(() => overlay.current?.update());
  return (
    <group
      ref={host}
      onClick={(event) => {
        // A drag or orbit must not also select a joint.
        if (event.delta > 3 || event.instanceId === undefined) return;
        const id = event.object.userData.boneIds?.[event.instanceId];
        if (typeof id === "string") {
          event.stopPropagation();
          onSelectBone?.(id);
        }
      }}
    />
  );
}
