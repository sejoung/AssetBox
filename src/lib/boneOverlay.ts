import * as THREE from "three";
import { collectRigBones, rigBoneParent } from "./riggingInspection";

/** Owns only overlay buffers/materials. The model's bones and skin data stay intact. */
export function createBoneOverlay(model: THREE.Object3D) {
  const bones = collectRigBones(model);
  const boneSet = new Set(bones);
  const links = bones.flatMap((bone) => {
    const parent = rigBoneParent(bone, boneSet);
    return parent ? [[parent, bone] as const] : [];
  });
  const group = new THREE.Group();
  group.name = "AssetBox bone overlay";
  const jointGeometry = new THREE.BufferGeometry();
  const lineGeometry = new THREE.BufferGeometry();
  const joints = new THREE.Float32BufferAttribute(new Float32Array(bones.length * 3), 3);
  const lines = new THREE.Float32BufferAttribute(new Float32Array(links.length * 6), 3);
  jointGeometry.setAttribute("position", joints);
  lineGeometry.setAttribute("position", lines);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: "#1680a8",
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const jointMaterial = new THREE.PointsMaterial({
    color: "#7dd3fc",
    size: 4,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const outlineMaterial = new THREE.PointsMaterial({
    color: "#17212e",
    size: 7,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  group.add(
    new THREE.LineSegments(lineGeometry, lineMaterial),
    new THREE.Points(jointGeometry, outlineMaterial),
    new THREE.Points(jointGeometry, jointMaterial)
  );
  group.children.forEach((object, index) => {
    object.frustumCulled = false;
    object.renderOrder = 1000 + index;
  });
  const position = new THREE.Vector3();
  function write(attribute: THREE.BufferAttribute, index: number, bone: THREE.Bone) {
    bone.getWorldPosition(position);
    attribute.setXYZ(index, position.x, position.y, position.z);
  }
  return {
    group,
    update() {
      bones.forEach((bone, index) => write(joints, index, bone));
      links.forEach(([parent, bone], index) => {
        write(lines, index * 2, parent);
        write(lines, index * 2 + 1, bone);
      });
      joints.needsUpdate = true;
      lines.needsUpdate = true;
    },
    dispose() {
      jointGeometry.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      jointMaterial.dispose();
      outlineMaterial.dispose();
    },
  };
}
