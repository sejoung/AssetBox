import * as THREE from "three";
import { collectRigBones } from "./riggingInspection";

export interface BoneInfluenceTarget {
  mesh: THREE.SkinnedMesh;
  name: string;
  weights: Float32Array | null;
  weightedVertices: number;
  maxWeight: number;
}
export interface BoneSelection {
  model: THREE.Group;
  boneId: string;
  name: string;
  targets: BoneInfluenceTarget[];
}

/** Skin indices are local to each mesh's skeleton, never to the scene bone list. */
export function inspectBoneInfluence(model: THREE.Group, boneId: string): BoneSelection | null {
  const bone = collectRigBones(model).find((item) => item.uuid === boneId);
  if (!bone) return null;
  const targets: BoneInfluenceTarget[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const indices = new Set<number>();
    object.skeleton.bones.forEach((joint, index) => {
      if (joint === bone) indices.add(index);
    });
    if (!indices.size) return;
    const target: BoneInfluenceTarget = {
      mesh: object,
      name: object.name || `Skinned mesh ${targets.length + 1}`,
      weights: null,
      weightedVertices: 0,
      maxWeight: 0,
    };
    targets.push(target);
    const count = object.geometry.getAttribute("position")?.count;
    const joints = object.geometry.getAttribute("skinIndex"),
      weights = object.geometry.getAttribute("skinWeight");
    if (
      count === undefined ||
      !joints ||
      !weights ||
      joints.count !== count ||
      weights.count !== count ||
      joints.itemSize !== weights.itemSize
    )
      return;
    target.weights = new Float32Array(count);
    for (let vertex = 0; vertex < count; vertex++) {
      let weight = 0;
      for (let slot = 0; slot < joints.itemSize; slot++) {
        const value = weights.getComponent(vertex, slot);
        if (indices.has(joints.getComponent(vertex, slot)) && Number.isFinite(value) && value > 0)
          weight += value;
      }
      target.weights[vertex] = weight;
      if (weight > 0) target.weightedVertices++;
      target.maxWeight = Math.max(target.maxWeight, weight);
    }
  });
  return { model, boneId, name: bone.name || "Unnamed bone", targets };
}

/** Posed, independently owned surfaces; no original materials or colors are replaced. */
export function createBoneInfluenceOverlay(selection: BoneSelection) {
  const group = new THREE.Group();
  group.name = "Bone weight influence";
  const material = new THREE.ShaderMaterial({
    uniforms: {
      lowColor: { value: new THREE.Color("#316bdb") },
      middleColor: { value: new THREE.Color("#39d4c0") },
      highColor: { value: new THREE.Color("#ffb34d") },
    },
    vertexShader: `
      attribute float boneWeight;
      varying float vWeight;
      void main() {
        vWeight = boneWeight;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 lowColor;
      uniform vec3 middleColor;
      uniform vec3 highColor;
      varying float vWeight;
      void main() {
        float weight = clamp(vWeight, 0.0, 1.0);
        vec3 color = weight < 0.5
          ? mix(lowColor, middleColor, weight * 2.0)
          : mix(middleColor, highColor, (weight - 0.5) * 2.0);
        gl_FragColor = vec4(color, 0.86 * smoothstep(0.0, 0.025, weight));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  const geometries: THREE.BufferGeometry[] = [];
  const surfaces: { source: THREE.SkinnedMesh; surface: THREE.Mesh }[] = [];
  const position = new THREE.Vector3();
  selection.model.updateWorldMatrix(true, true);
  for (const { mesh, weights, weightedVertices } of selection.targets) {
    if (!weights || !weightedVertices) continue;
    mesh.skeleton.update();
    const positions = new Float32Array(weights.length * 3);
    for (let vertex = 0; vertex < weights.length; vertex++) {
      mesh.getVertexPosition(vertex, position).toArray(positions, vertex * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("boneWeight", new THREE.Float32BufferAttribute(weights, 1));
    if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
    geometry.setDrawRange(mesh.geometry.drawRange.start, mesh.geometry.drawRange.count);
    geometries.push(geometry);
    const surface = new THREE.Mesh(geometry, material);
    surface.name = `Weights: ${mesh.name}`;
    surface.matrixAutoUpdate = false;
    surface.frustumCulled = false;
    surface.renderOrder = 900;
    group.add(surface);
    surfaces.push({ source: mesh, surface });
  }
  return {
    group,
    update() {
      surfaces.forEach(({ source, surface }) => {
        source.updateWorldMatrix(true, false);
        surface.matrix.copy(source.matrixWorld);
        if (selection.model.animations.length) {
          source.skeleton.update();
          const positions = surface.geometry.getAttribute("position");
          for (let vertex = 0; vertex < positions.count; vertex++) {
            source.getVertexPosition(vertex, position);
            positions.setXYZ(vertex, position.x, position.y, position.z);
          }
          positions.needsUpdate = true;
        }
      });
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
    },
  };
}
