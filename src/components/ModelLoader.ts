import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";
import { convertFileSrc } from "@tauri-apps/api/core";

export interface MeshDiagnostics {
  // Geometry
  degenerateTriCount: number;
  boundingBox: { x: number; y: number; z: number };

  // Topology
  nonManifoldEdgeCount: number;
  openEdgeCount: number;
  flippedNormalTriCount: number;

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

export interface LoadedModel {
  scene: THREE.Group;
  polyCount: number;
  vertexCount: number;
  meshCount: number;
  hasEmbeddedTextures: boolean;
  diagnostics: MeshDiagnostics;
  retopoDiag: RetopoDiagInfo;
}

const DEGENERATE_AREA_THRESHOLD = 1e-8;

function getTriangleIndices(geometry: THREE.BufferGeometry): {
  triCount: number;
  getIndices: (i: number) => [number, number, number];
} {
  const index = geometry.index;
  const posCount = geometry.attributes.position.count;
  const triCount = index ? index.count / 3 : posCount / 3;

  const getIndices = index
    ? (i: number): [number, number, number] => [
        index.getX(i * 3),
        index.getX(i * 3 + 1),
        index.getX(i * 3 + 2),
      ]
    : (i: number): [number, number, number] => [i * 3, i * 3 + 1, i * 3 + 2];

  return { triCount, getIndices };
}

function countDegenerateTriangles(geometry: THREE.BufferGeometry): number {
  const position = geometry.attributes.position;
  if (!position) return 0;

  const { triCount, getIndices } = getTriangleIndices(geometry);
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const cross = new THREE.Vector3();

  let degenerate = 0;
  for (let i = 0; i < triCount; i++) {
    const [a, b, c] = getIndices(i);
    vA.fromBufferAttribute(position, a);
    vB.fromBufferAttribute(position, b);
    vC.fromBufferAttribute(position, c);
    edge1.subVectors(vB, vA);
    edge2.subVectors(vC, vA);
    cross.crossVectors(edge1, edge2);
    if (cross.lengthSq() < DEGENERATE_AREA_THRESHOLD) degenerate++;
  }
  return degenerate;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function analyzeEdges(geometry: THREE.BufferGeometry): { nonManifold: number; openEdges: number } {
  const position = geometry.attributes.position;
  if (!position) return { nonManifold: 0, openEdges: 0 };

  const { triCount, getIndices } = getTriangleIndices(geometry);
  const edgeFaceCount = new Map<string, number>();

  for (let i = 0; i < triCount; i++) {
    const [a, b, c] = getIndices(i);
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      edgeFaceCount.set(key, (edgeFaceCount.get(key) ?? 0) + 1);
    }
  }

  let nonManifold = 0;
  let openEdges = 0;
  for (const count of edgeFaceCount.values()) {
    if (count > 2) nonManifold++;
    if (count === 1) openEdges++;
  }

  return { nonManifold, openEdges };
}

function countFlippedNormalTriangles(geometry: THREE.BufferGeometry): number {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || !normal) return 0;

  const { triCount, getIndices } = getTriangleIndices(geometry);
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const avgNormal = new THREE.Vector3();

  let flipped = 0;
  for (let i = 0; i < triCount; i++) {
    const [a, b, c] = getIndices(i);
    vA.fromBufferAttribute(position, a);
    vB.fromBufferAttribute(position, b);
    vC.fromBufferAttribute(position, c);
    edge1.subVectors(vB, vA);
    edge2.subVectors(vC, vA);
    faceNormal.crossVectors(edge1, edge2);
    if (faceNormal.lengthSq() < DEGENERATE_AREA_THRESHOLD) continue;

    nA.fromBufferAttribute(normal, a);
    nB.fromBufferAttribute(normal, b);
    nC.fromBufferAttribute(normal, c);
    avgNormal.addVectors(nA, nB).add(nC);
    if (avgNormal.lengthSq() < DEGENERATE_AREA_THRESHOLD) continue;

    if (faceNormal.dot(avgNormal) < 0) flipped++;
  }
  return flipped;
}

function countUVChannels(geometry: THREE.BufferGeometry): number {
  let count = 0;
  if (geometry.attributes.uv) count++;
  if (geometry.attributes.uv2) count++;
  return count;
}

function analyzeModel(object: THREE.Object3D): Omit<LoadedModel, "scene"> {
  let polyCount = 0;
  let vertexCount = 0;
  let meshCount = 0;
  let hasEmbeddedTextures = false;
  let meshesWithoutUV = 0;
  let degenerateTriCount = 0;
  let nonManifoldEdgeCount = 0;
  let openEdgeCount = 0;
  let flippedNormalTriCount = 0;
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
      if (!geometry.attributes.uv) {
        meshesWithoutUV++;
      }
      uvChannelCounts.push(countUVChannels(geometry));

      // Geometry quality
      degenerateTriCount += countDegenerateTriangles(geometry);

      // Topology
      const edges = analyzeEdges(geometry);
      nonManifoldEdgeCount += edges.nonManifold;
      openEdgeCount += edges.openEdges;
      flippedNormalTriCount += countFlippedNormalTriangles(geometry);

      // Material
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      if (!child.material || materials.length === 0) {
        meshesWithoutMaterial++;
      }
      for (const mat of materials) {
        if (mat) {
          materialSet.add(mat.uuid);
          if ((mat as THREE.MeshStandardMaterial).map) {
            hasEmbeddedTextures = true;
          }
        }
      }
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
    hasEmbeddedTextures,
    diagnostics: {
      degenerateTriCount,
      boundingBox: {
        x: parseFloat(size.x.toFixed(2)),
        y: parseFloat(size.y.toFixed(2)),
        z: parseFloat(size.z.toFixed(2)),
      },
      nonManifoldEdgeCount,
      openEdgeCount,
      flippedNormalTriCount,
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
  const allAreas: number[] = [];
  const allAspects: number[] = [];
  const vA = new THREE.Vector3(),
    vB = new THREE.Vector3(),
    vC = new THREE.Vector3();
  const e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();

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
      allAreas.push(area);

      const edgeAB = vA.distanceTo(vB);
      const edgeBC = vB.distanceTo(vC);
      const edgeCA = vC.distanceTo(vA);
      const longest = Math.max(edgeAB, edgeBC, edgeCA);
      const shortest = Math.min(edgeAB, edgeBC, edgeCA);
      allAspects.push(shortest > 1e-10 ? longest / shortest : 100);
    }
  });

  const totalTris = allAreas.length;
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

  let sum = 0;
  let minArea = Infinity;
  let maxArea = 0;
  let thinCount = 0;
  for (let i = 0; i < totalTris; i++) {
    const a = allAreas[i];
    sum += a;
    if (a < minArea) minArea = a;
    if (a > maxArea) maxArea = a;
    if (allAspects[i] > 10) thinCount++;
  }
  const avgArea = sum / totalTris;
  const densityRatio = minArea > 1e-10 ? maxArea / minArea : Infinity;

  let overDenseCount = 0;
  let underDenseCount = 0;
  const overThreshold = avgArea * 0.1;
  const underThreshold = avgArea * 5;
  for (let i = 0; i < totalTris; i++) {
    if (allAreas[i] < overThreshold) overDenseCount++;
    if (allAreas[i] > underThreshold) underDenseCount++;
  }

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

export function loadModel(filePath: string): Promise<LoadedModel> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  const url = filePath.startsWith("http") ? filePath : convertFilePath(filePath);

  return new Promise((resolve, reject) => {
    const onLoad = (object: THREE.Group) => {
      const stats = analyzeModel(object);
      resolve({ scene: object, ...stats });
    };

    switch (ext) {
      case "glb":
      case "gltf": {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => onLoad(gltf.scene), undefined, reject);
        break;
      }
      case "fbx": {
        const loader = new FBXLoader();
        loader.load(url, (fbx) => onLoad(fbx), undefined, reject);
        break;
      }
      case "obj": {
        const loader = new OBJLoader();
        loader.load(url, (obj) => onLoad(obj as THREE.Group), undefined, reject);
        break;
      }
      default:
        reject(new Error(`Unsupported format: ${ext}`));
    }
  });
}
