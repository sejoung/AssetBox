import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";
import {
  analyzeEdges,
  analyzeNormalConsistency,
  countDegenerateTriangles,
  uvChannels,
} from "../lib/geometryDiagnostics";
import {
  inspectTextures,
  materialTextures,
  meshMaterials,
  type TextureInspection,
} from "../lib/materialInspection";
import { convertFileSrc } from "@tauri-apps/api/core";

export interface MeshDiagnostics {
  // Geometry
  degenerateTriCount: number;
  boundingBox: { x: number; y: number; z: number };

  // Topology
  nonManifoldEdgeCount: number;
  openEdgeCount: number;
  normalMismatchTriCount: number;
  uncheckedNormalTriCount: number;
  meshesMissingRequiredUV: number;

  // UV
  meshesWithoutUV: number;
  uvChannelCounts: number[];

  // Material
  materialCount: number;
  meshesWithoutMaterial: number;

  // Transform
  nonUniformScaleCount: number;
  offCenterDistance: number;
}

export type { RetopoDiagInfo } from "../types/asset";
import type { RetopoDiagInfo } from "../types/asset";
import { disposeScene } from "../lib/disposeScene";

export interface LoadedModel {
  scene: THREE.Group;
  polyCount: number;
  vertexCount: number;
  meshCount: number;
  textureInspection: TextureInspection;
  diagnostics: MeshDiagnostics;
  retopoDiag: RetopoDiagInfo;
}

export function analyzeModel(
  object: THREE.Object3D,
  referencesVerified = true,
  failedResources: string[] = []
): Omit<LoadedModel, "scene"> {
  let polyCount = 0;
  let vertexCount = 0;
  let meshCount = 0;
  let meshesWithoutUV = 0;
  let degenerateTriCount = 0;
  let nonManifoldEdgeCount = 0;
  let openEdgeCount = 0;
  let normalMismatchTriCount = 0;
  let uncheckedNormalTriCount = 0;
  let meshesMissingRequiredUV = 0;
  const uvChannelCounts: number[] = [];
  const materialSet = new Set<string>();
  let meshesWithoutMaterial = 0;
  let nonUniformScaleCount = 0;

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const geometry = child.geometry;

      if (geometry.index) {
        polyCount += geometry.index.count / 3;
      } else {
        polyCount += geometry.attributes.position.count / 3;
      }
      vertexCount += geometry.attributes.position.count;

      // UV
      const channels = uvChannels(geometry);
      if (channels.length === 0) {
        meshesWithoutUV++;
      }
      uvChannelCounts.push(channels.length);

      // Geometry quality
      degenerateTriCount += countDegenerateTriangles(geometry);

      // Topology
      const edges = analyzeEdges(geometry);
      nonManifoldEdgeCount += edges.nonManifold;
      openEdgeCount += edges.openEdges;
      const normals = analyzeNormalConsistency(geometry);
      normalMismatchTriCount += normals.mismatches;
      uncheckedNormalTriCount += normals.unchecked;

      // Material
      const materials = meshMaterials(child);
      if (!child.material || materials.length === 0) {
        meshesWithoutMaterial++;
      }
      let missingRequiredUV = false;
      for (const mat of materials) {
        if (mat) {
          materialSet.add(mat.uuid);
          const textures = materialTextures(mat);
          if (
            textures.some(
              (texture) =>
                texture.mapping === THREE.UVMapping && !channels.includes(texture.channel)
            )
          )
            missingRequiredUV = true;
        }
      }
      if (missingRequiredUV) meshesMissingRequiredUV++;
    }

    // Transform check — non-uniform scale on any object
    const s = child.scale;
    const epsilon = 0.001;
    if (
      Math.abs(s.x - s.y) > epsilon ||
      Math.abs(s.y - s.z) > epsilon ||
      Math.abs(s.x - s.z) > epsilon
    ) {
      nonUniformScaleCount++;
    }
  });

  // Bounding box & pivot offset
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const offCenterDistance = center.length();

  return {
    polyCount,
    vertexCount,
    meshCount,
    textureInspection: inspectTextures(object, referencesVerified, failedResources),
    diagnostics: {
      degenerateTriCount,
      boundingBox: {
        x: parseFloat(size.x.toFixed(2)),
        y: parseFloat(size.y.toFixed(2)),
        z: parseFloat(size.z.toFixed(2)),
      },
      nonManifoldEdgeCount,
      openEdgeCount,
      normalMismatchTriCount,
      uncheckedNormalTriCount,
      meshesMissingRequiredUV,
      meshesWithoutUV,
      uvChannelCounts,
      materialCount: materialSet.size,
      meshesWithoutMaterial,
      nonUniformScaleCount,
      offCenterDistance: parseFloat(offCenterDistance.toFixed(2)),
    },
    retopoDiag: analyzeRetopo(object),
  };
}

export function analyzeRetopo(object: THREE.Object3D): RetopoDiagInfo {
  // Single-pass analysis: no intermediate arrays, compute stats inline
  let totalTris = 0;
  let sum = 0;
  let minArea = Infinity;
  let maxArea = 0;
  let thinCount = 0;

  const vA = new THREE.Vector3(),
    vB = new THREE.Vector3(),
    vC = new THREE.Vector3();
  const e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();

  // First pass: compute sum, min, max, thin count
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geo = child.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;

    const index = geo.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    totalTris += triCount;

    for (let i = 0; i < triCount; i++) {
      let a: number, b: number, c: number;
      if (index) {
        a = index.getX(i * 3);
        b = index.getX(i * 3 + 1);
        c = index.getX(i * 3 + 2);
      } else {
        a = i * 3;
        b = i * 3 + 1;
        c = i * 3 + 2;
      }

      vA.fromBufferAttribute(pos, a);
      vB.fromBufferAttribute(pos, b);
      vC.fromBufferAttribute(pos, c);

      e1.subVectors(vB, vA);
      e2.subVectors(vC, vA);
      const area = e1.cross(e2).length() * 0.5;
      sum += area;
      if (area < minArea) minArea = area;
      if (area > maxArea) maxArea = area;

      const edgeAB = vA.distanceTo(vB);
      const edgeBC = vB.distanceTo(vC);
      const edgeCA = vC.distanceTo(vA);
      const longest = Math.max(edgeAB, edgeBC, edgeCA);
      const shortest = Math.min(edgeAB, edgeBC, edgeCA);
      if ((shortest > 0 ? longest / shortest : 100) > 10) thinCount++;
    }
  });

  if (totalTris === 0) {
    return {
      totalTris: 0,
      avgArea: 0,
      minArea: 0,
      maxArea: 0,
      densityRatio: 0,
      thinTriPercent: 0,
      overDensePercent: 0,
      underDensePercent: 0,
      needsRetopo: false,
      reasons: [],
    };
  }

  const avgArea = sum / totalTris;
  const densityRatio = minArea > 0 ? maxArea / minArea : Infinity;

  // Second pass: count over/under-dense (needs avgArea from first pass)
  let overDenseCount = 0;
  let underDenseCount = 0;
  const overThreshold = avgArea * 0.1;
  const underThreshold = avgArea * 5;

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geo = child.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;

    const index = geo.index;
    const triCount = index ? index.count / 3 : pos.count / 3;

    for (let i = 0; i < triCount; i++) {
      let a: number, b: number, c: number;
      if (index) {
        a = index.getX(i * 3);
        b = index.getX(i * 3 + 1);
        c = index.getX(i * 3 + 2);
      } else {
        a = i * 3;
        b = i * 3 + 1;
        c = i * 3 + 2;
      }

      vA.fromBufferAttribute(pos, a);
      vB.fromBufferAttribute(pos, b);
      vC.fromBufferAttribute(pos, c);
      e1.subVectors(vB, vA);
      e2.subVectors(vC, vA);
      const area = e1.cross(e2).length() * 0.5;

      if (area < overThreshold) overDenseCount++;
      if (area > underThreshold) underDenseCount++;
    }
  });

  const thinTriPercent = (thinCount / totalTris) * 100;
  const overDensePercent = (overDenseCount / totalTris) * 100;
  const underDensePercent = (underDenseCount / totalTris) * 100;

  const reasons: string[] = [];
  if (thinTriPercent > 5) reasons.push(`Thin triangles: ${thinTriPercent.toFixed(1)}%`);
  if (overDensePercent > 10) reasons.push(`Over-dense areas: ${overDensePercent.toFixed(1)}%`);
  if (underDensePercent > 10) reasons.push(`Under-dense areas: ${underDensePercent.toFixed(1)}%`);
  if (densityRatio > 1000) reasons.push(`Density imbalance: ${densityRatio.toFixed(0)}x`);

  return {
    totalTris,
    avgArea,
    minArea,
    maxArea,
    densityRatio,
    thinTriPercent,
    overDensePercent,
    underDensePercent,
    needsRetopo: reasons.length > 0,
    reasons,
  };
}

export function convertFilePath(filePath: string): string {
  // Use Tauri's built-in convertFileSrc which handles platform differences:
  // - Windows: http://asset.localhost/{path}
  // - macOS/Linux: asset://localhost/{path}
  // Falls back to manual construction for non-Tauri environments (tests).
  try {
    return convertFileSrc(filePath);
  } catch {
    const normalized = filePath.replace(/\\/g, "/");
    const encoded = normalized
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `asset://localhost/${encoded}`;
  }
}

function loadModelFresh(filePath: string): Promise<LoadedModel> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  const url = filePath.startsWith("http") ? filePath : convertFilePath(filePath);

  return new Promise((resolve, reject) => {
    const failedResources: string[] = [];
    const manager = new THREE.LoadingManager();
    manager.onError = (url) => failedResources.push(url);
    let object: THREE.Group | null = null;
    // FBX may finish parsing before its images. Inspect after all manager items finish.
    manager.onLoad = () => {
      if (!object) return;
      try {
        const stats = analyzeModel(object, ext !== "obj", failedResources);
        resolve({ scene: object, ...stats });
      } catch (error) {
        disposeScene(object);
        reject(error);
      }
    };
    const onLoad = (loaded: THREE.Group) => {
      object = loaded;
    };

    switch (ext) {
      case "glb":
      case "gltf": {
        const loader = new GLTFLoader(manager);
        loader.load(url, (gltf) => onLoad(gltf.scene), undefined, reject);
        break;
      }
      case "fbx": {
        const loader = new FBXLoader(manager);
        loader.load(url, (fbx) => onLoad(fbx), undefined, reject);
        break;
      }
      case "obj": {
        const loader = new OBJLoader(manager);
        loader.load(url, (obj) => onLoad(obj as THREE.Group), undefined, reject);
        break;
      }
      default:
        reject(new Error(`Unsupported format: ${ext}`));
    }
  });
}

// ── Prefetch cache ──
//
// Sequential review means the next file is usually the one below the current
// one in the tree, so it is loaded during idle time. Entries are *single use*:
// a cache hit removes the entry, handing ownership (and the duty to dispose)
// to the caller. That keeps a scene from ever being handed out twice after the
// viewer has disposed it.

const PREFETCH_LIMIT = 2;
const prefetchCache = new Map<string, Promise<LoadedModel>>();

function evictOldest(): void {
  while (prefetchCache.size >= PREFETCH_LIMIT) {
    const oldest = prefetchCache.keys().next();
    if (oldest.done) return;
    const pending = prefetchCache.get(oldest.value);
    prefetchCache.delete(oldest.value);
    // Release whatever the dropped entry ends up loading.
    pending?.then((model) => disposeScene(model.scene)).catch(() => {});
  }
}

/** Warms the cache for `filePath`. Failures are swallowed — this is best effort. */
export function prefetchModel(filePath: string): void {
  if (!filePath || prefetchCache.has(filePath)) return;
  evictOldest();

  const pending = loadModelFresh(filePath);
  prefetchCache.set(filePath, pending);
  pending.catch(() => {
    if (prefetchCache.get(filePath) === pending) prefetchCache.delete(filePath);
  });
}

/** Drops every prefetched model. Called when the tree root changes. */
export function clearPrefetch(): void {
  for (const pending of prefetchCache.values()) {
    pending.then((model) => disposeScene(model.scene)).catch(() => {});
  }
  prefetchCache.clear();
}

export function loadModel(filePath: string): Promise<LoadedModel> {
  const cached = prefetchCache.get(filePath);
  if (cached) {
    prefetchCache.delete(filePath);
    return cached;
  }
  return loadModelFresh(filePath);
}
