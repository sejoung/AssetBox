import * as THREE from "three";
import type { RiggingInfo, SkinInfo } from "../types/asset";

/** Include detached joints referenced by a skin as well as unbound scene bones. */
export function collectRigBones(model: THREE.Object3D): THREE.Bone[] {
  const bones = new Set<THREE.Bone>();
  model.traverse((object) => {
    if (object instanceof THREE.Bone) bones.add(object);
    if (object instanceof THREE.SkinnedMesh) {
      for (const bone of object.skeleton.bones) if (bone) bones.add(bone);
    }
  });
  return [...bones];
}

export function rigBoneParent(bone: THREE.Bone, bones: Set<THREE.Bone>): THREE.Bone | null {
  for (let parent = bone.parent; parent; parent = parent.parent) {
    if (parent instanceof THREE.Bone && bones.has(parent)) return parent;
  }
  return null;
}

function skinInfo(mesh: THREE.SkinnedMesh, index: number): SkinInfo {
  const vertexCount = mesh.geometry.getAttribute("position")?.count ?? 0;
  const info: SkinInfo = {
    id: mesh.uuid,
    name: mesh.name || `Skinned mesh ${index + 1}`,
    boneCount: mesh.skeleton.bones.length,
    vertexCount,
    maxInfluences: null,
    unweightedVertices: null,
    invalidInfluenceVertices: null,
  };
  const weights = mesh.geometry.getAttribute("skinWeight");
  const joints = mesh.geometry.getAttribute("skinIndex");
  if (
    !weights ||
    !joints ||
    weights.count !== vertexCount ||
    joints.count !== vertexCount ||
    weights.itemSize !== joints.itemSize
  )
    return info;

  let maxInfluences = 0,
    unweighted = 0,
    invalid = 0;
  const influencingJoints: number[] = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    influencingJoints.length = 0;
    let invalidVertex = false;
    for (let slot = 0; slot < weights.itemSize; slot++) {
      const weight = weights.getComponent(vertex, slot);
      if (!Number.isFinite(weight) || weight < 0) {
        invalidVertex = true;
        continue;
      }
      if (weight === 0) continue;
      const joint = joints.getComponent(vertex, slot);
      if (!Number.isInteger(joint) || !mesh.skeleton.bones[joint]) {
        invalidVertex = true;
        continue;
      }
      if (!influencingJoints.includes(joint)) influencingJoints.push(joint);
    }
    const influences = influencingJoints.length;
    if (influences === 0) unweighted++;
    if (invalidVertex) invalid++;
    maxInfluences = Math.max(maxInfluences, influences);
  }
  return {
    ...info,
    maxInfluences,
    unweightedVertices: unweighted,
    invalidInfluenceVertices: invalid,
  };
}

export function inspectRigging(model: THREE.Object3D, animations = model.animations): RiggingInfo {
  const bones = collectRigBones(model);
  const boneSet = new Set(bones);
  const skeletons = new Set<THREE.Skeleton>();
  const skins: SkinInfo[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    skeletons.add(object.skeleton);
    skins.push(skinInfo(object, skins.length));
  });
  return {
    skeletonCount: skeletons.size,
    bones: bones.map((bone, index) => ({
      id: bone.uuid,
      name: bone.name || `Bone ${index + 1}`,
      parentId: rigBoneParent(bone, boneSet)?.uuid ?? null,
    })),
    skins,
    clips: animations.map((clip, index) => ({
      id: clip.uuid,
      name: clip.name || `Clip ${index + 1}`,
      duration: Number.isFinite(clip.duration) && clip.duration >= 0 ? clip.duration : null,
      trackCount: clip.tracks.length,
    })),
  };
}
