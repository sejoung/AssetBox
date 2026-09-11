import * as THREE from "three";
import { collectRigBones, rigBoneParent } from "./riggingInspection";

/** A short head pyramid and a long tapered tail, aligned along local +Y. */
function octahedralBoneGeometry(): THREE.BufferGeometry {
  const vertices = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.07, 0.2, 0),
    new THREE.Vector3(0, 0.2, 0.07),
    new THREE.Vector3(-0.07, 0.2, 0),
    new THREE.Vector3(0, 0.2, -0.07),
    new THREE.Vector3(0, 1, 0),
  ];
  const positions: number[] = [];
  const center = new THREE.Vector3(0, 0.2, 0);
  const normal = new THREE.Vector3(),
    edge = new THREE.Vector3(),
    outward = new THREE.Vector3();
  for (let side = 0; side < 4; side++) {
    for (const tip of [0, 5]) {
      const a = vertices[tip];
      let b = vertices[side + 1],
        c = vertices[((side + 1) % 4) + 1];
      normal.subVectors(b, a).cross(edge.subVectors(c, a));
      outward
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3)
        .sub(center);
      if (normal.dot(outward) < 0) [b, c] = [c, b];
      positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Fixed facet shading keeps the overlay legible in every preview lighting mode. */
function shadeFacets(geometry: THREE.BufferGeometry): void {
  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(normals.count * 3);
  const light = new THREE.Vector3(-0.5, 0.6, 1).normalize();
  const normal = new THREE.Vector3();
  const base = new THREE.Color("#70c4e3"),
    color = new THREE.Color();
  for (let index = 0; index < normals.count; index++) {
    const brightness =
      0.58 + 0.42 * Math.max(0, normal.fromBufferAttribute(normals, index).dot(light));
    color
      .copy(base)
      .multiplyScalar(brightness)
      .toArray(colors, index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Owns only overlay buffers/materials. Never changes bone transforms or skin data. */
export function createBoneOverlay(model: THREE.Object3D, selectedBoneId: string | null = null) {
  const bones = collectRigBones(model);
  const boneSet = new Set(bones);
  const boneIndices = new Map(bones.map((bone, index) => [bone, index]));
  const links = bones.flatMap((bone, index) => {
    const parent = rigBoneParent(bone, boneSet);
    return parent ? [[boneIndices.get(parent)!, index] as const] : [];
  });
  const group = new THREE.Group();
  group.name = "AssetBox bone overlay";
  const boneGeometry = octahedralBoneGeometry();
  const jointGeometry = new THREE.SphereGeometry(1, 8, 6).toNonIndexed();
  shadeFacets(boneGeometry);
  shadeFacets(jointGeometry);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    depthTest: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  });
  const bodies = new THREE.InstancedMesh(boneGeometry, material, links.length);
  bodies.name = "Octahedral bones";
  const joints = new THREE.InstancedMesh(jointGeometry, material, bones.length);
  joints.name = "Bone joints";
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const hiddenMaterial = material.clone();
  hiddenMaterial.depthFunc = THREE.GreaterDepth;
  hiddenMaterial.opacity = 0.16;
  const hiddenBodies = new THREE.InstancedMesh(boneGeometry, hiddenMaterial, links.length);
  hiddenBodies.name = "Occluded bones";
  const hiddenJoints = new THREE.InstancedMesh(jointGeometry, hiddenMaterial, bones.length);
  hiddenJoints.name = "Occluded joints";
  const bodyIds: string[] = [];
  bodies.userData.boneIds = hiddenBodies.userData.boneIds = bodyIds;
  joints.userData.boneIds = hiddenJoints.userData.boneIds = bones.map((bone) => bone.uuid);
  // Raycasting should only consider one copy of each visible/occluded instance.
  hiddenBodies.raycast = hiddenJoints.raycast = () => {};

  const edgeTemplate = new THREE.EdgesGeometry(boneGeometry);
  const templatePositions = edgeTemplate.getAttribute("position");
  const outlineGeometry = new THREE.BufferGeometry();
  const outlines = new THREE.Float32BufferAttribute(
    new Float32Array(links.length * templatePositions.count * 3),
    3
  );
  outlines.setUsage(THREE.DynamicDrawUsage);
  outlineGeometry.setAttribute("position", outlines);
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: "#173e50",
    depthTest: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const edges = new THREE.LineSegments(outlineGeometry, outlineMaterial);
  edges.name = "Bone outlines";
  const hiddenOutlineMaterial = outlineMaterial.clone();
  hiddenOutlineMaterial.depthFunc = THREE.GreaterDepth;
  hiddenOutlineMaterial.opacity = 0.3;
  const hiddenEdges = new THREE.LineSegments(outlineGeometry, hiddenOutlineMaterial);
  hiddenEdges.name = "Occluded outlines";
  edges.raycast = hiddenEdges.raycast = () => {};
  group.add(hiddenBodies, hiddenJoints, hiddenEdges, bodies, joints, edges);
  group.children.forEach((object, index) => {
    object.frustumCulled = false;
    object.renderOrder = 1000 + index;
  });

  const selectedMaterial = new THREE.MeshBasicMaterial({
    color: "#ffbf47",
    transparent: true,
    opacity: 0.95,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const hiddenSelectedMaterial = selectedMaterial.clone();
  hiddenSelectedMaterial.depthFunc = THREE.GreaterDepth;
  hiddenSelectedMaterial.opacity = 0.48;
  const selectedBody = new THREE.InstancedMesh(boneGeometry, selectedMaterial, links.length);
  selectedBody.name = "Selected bones";
  const selectedJoint = new THREE.Mesh(jointGeometry, selectedMaterial);
  const hiddenSelectedBody = new THREE.InstancedMesh(
    boneGeometry,
    hiddenSelectedMaterial,
    links.length
  );
  const hiddenSelectedJoint = new THREE.Mesh(jointGeometry, hiddenSelectedMaterial);
  const selectedMeshes = [selectedBody, selectedJoint, hiddenSelectedBody, hiddenSelectedJoint];
  for (const mesh of selectedMeshes) {
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1010;
    mesh.raycast = () => {};
    group.add(mesh);
  }

  const positions = bones.map(() => new THREE.Vector3());
  const radii = new Float64Array(bones.length);
  const direction = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    point = new THREE.Vector3();
  const rotation = new THREE.Quaternion(),
    identity = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(),
    up = new THREE.Vector3(0, 1, 0);
  const bounds = new THREE.Box3(),
    size = new THREE.Vector3();
  let disposed = false;
  return {
    group,
    update() {
      if (disposed) return;
      bones.forEach((bone, index) => bone.getWorldPosition(positions[index]));
      selectedMeshes.forEach((mesh) => {
        mesh.visible = false;
      });
      radii.fill(Infinity);
      let count = 0,
        selectedCount = 0;
      for (const [parent, child] of links) {
        direction.subVectors(positions[child], positions[parent]);
        const length = direction.length();
        // Coincident joints have no direction. Keep the joint, omit its body.
        if (!Number.isFinite(length) || length === 0) continue;
        radii[parent] = Math.min(radii[parent], length * 0.025);
        radii[child] = Math.min(radii[child], length * 0.025);
        rotation.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
        matrix.compose(positions[parent], rotation, scale.setScalar(length));
        bodies.setMatrixAt(count, matrix);
        hiddenBodies.setMatrixAt(count, matrix);
        bodyIds[count] = bones[parent].uuid;
        if (bones[parent].uuid === selectedBoneId) {
          for (const mesh of [selectedBody, hiddenSelectedBody]) {
            mesh.visible = true;
            mesh.setMatrixAt(selectedCount, matrix);
          }
          selectedCount++;
        }
        for (let vertex = 0; vertex < templatePositions.count; vertex++) {
          point.fromBufferAttribute(templatePositions, vertex).applyMatrix4(matrix);
          outlines.setXYZ(count * templatePositions.count + vertex, point.x, point.y, point.z);
        }
        count++;
      }
      selectedBody.count = hiddenSelectedBody.count = selectedCount;
      selectedBody.instanceMatrix.needsUpdate = true;
      hiddenSelectedBody.instanceMatrix.needsUpdate = true;
      bodies.count = hiddenBodies.count = count;
      bodyIds.length = count;
      outlineGeometry.setDrawRange(0, count * templatePositions.count);
      bounds.setFromPoints(positions).getSize(size);
      let fallbackRadius = Math.max(size.x, size.y, size.z) * 0.012;
      if (!fallbackRadius) {
        bounds.setFromObject(model).getSize(size);
        fallbackRadius = Math.max(size.x, size.y, size.z) * 0.012 || 0.025;
      }
      positions.forEach((position, index) => {
        const radius = Number.isFinite(radii[index]) ? radii[index] : fallbackRadius;
        matrix.compose(position, identity, scale.setScalar(radius));
        joints.setMatrixAt(index, matrix);
        hiddenJoints.setMatrixAt(index, matrix);
        if (bones[index].uuid === selectedBoneId) {
          for (const mesh of [selectedJoint, hiddenSelectedJoint]) {
            mesh.visible = true;
            mesh.matrix.copy(matrix);
          }
        }
      });
      for (const mesh of [bodies, joints, hiddenBodies, hiddenJoints]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        // Instances move in world coordinates; invalidate the raycast bounds.
        mesh.boundingSphere = null;
      }
      outlines.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hiddenBodies.dispose();
      hiddenJoints.dispose();
      selectedBody.dispose();
      hiddenSelectedBody.dispose();
      selectedMaterial.dispose();
      hiddenSelectedMaterial.dispose();
      hiddenMaterial.dispose();
      hiddenOutlineMaterial.dispose();
      bodies.dispose();
      joints.dispose();
      boneGeometry.dispose();
      jointGeometry.dispose();
      edgeTemplate.dispose();
      outlineGeometry.dispose();
      material.dispose();
      outlineMaterial.dispose();
    },
  };
}
