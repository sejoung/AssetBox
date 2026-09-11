import { useLayoutEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { updateCameraClipping } from "../lib/cameraClipping";
import { collectRigBones } from "../lib/riggingInspection";

export function CameraClipping({
  model,
  bonesVisible,
}: {
  model: THREE.Group;
  bonesVisible: boolean;
}) {
  const { camera } = useThree();
  const bounds = useMemo(() => ({ local: new THREE.Box3(), world: new THREE.Box3() }), []);

  useLayoutEffect(() => {
    // The loaded pose is static. Measure it once, after Center places the model,
    // instead of traversing all meshes on every camera movement.
    model.updateWorldMatrix(true, true);
    bounds.local.setFromObject(model);
    if (bonesVisible || bounds.local.isEmpty()) {
      const position = new THREE.Vector3();
      for (const bone of collectRigBones(model)) {
        bounds.local.expandByPoint(bone.getWorldPosition(position));
      }
    }
    bounds.local.applyMatrix4(model.matrixWorld.clone().invert());
  }, [model, bonesVisible, bounds]);

  // OrbitControls updates at priority -1. Adjust clipping after damping/zoom/pan,
  // before the same frame renders, without moving the camera or its target.
  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    model.updateWorldMatrix(true, false);
    bounds.world.copy(bounds.local).applyMatrix4(model.matrixWorld);
    updateCameraClipping(camera, bounds.world);
  });

  return null;
}
