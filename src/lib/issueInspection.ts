import * as THREE from "three";
import type { ValidationItem } from "../types/asset";
import {
  analyzeEdges,
  analyzeNormalConsistency,
  countDegenerateTriangles,
  getTriangleIndices,
  uvChannels,
} from "./geometryDiagnostics";
import { imageResolution, meshMaterials } from "./materialInspection";

/** Snapshot source references before diagnostic view modes replace render data. */
export interface InspectionObject {
  object: THREE.Object3D;
  name: string;
  geometry?: THREE.BufferGeometry;
  previewPosition?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  materials: THREE.Material[];
  matrix: THREE.Matrix4;
  bounds: THREE.Box3;
  nonUniformScale: boolean;
}
export interface InspectionSource {
  model: THREE.Group;
  objects: InspectionObject[];
  failedResources: string[];
}
export interface InspectionTarget {
  id: string;
  name: string;
  count: number;
  unit: "edges" | "triangles" | "mesh" | "object";
  details: string[];
  bounds: THREE.Box3;
  /** Positions in model-local space; never used to modify the source mesh. */
  positions: Float32Array;
  primitive: "edges" | "triangles" | "bounds";
  truncated: boolean;
}
export interface IssueSelection {
  source: InspectionSource;
  item: ValidationItem;
  targets: InspectionTarget[];
  targetIndex: number;
}

export function captureInspectionSource(
  model: THREE.Group,
  failedResources: string[] = []
): InspectionSource {
  model.updateWorldMatrix(true, true);
  const inverse = model.matrixWorld.clone().invert();
  const objects: InspectionObject[] = [];
  const names = new Map<THREE.Object3D, string>();
  model.traverse((object) => {
    const mesh = object instanceof THREE.Mesh ? object : undefined;
    const parent = object.parent ? names.get(object.parent) : undefined;
    const label = object.name || `${mesh ? "Mesh" : "Object"} ${objects.length + 1}`;
    const name = parent ? `${parent} / ${label}` : label;
    names.set(object, name);
    const s = object.scale;
    let previewPosition = mesh?.geometry.attributes.position;
    if (
      mesh &&
      previewPosition &&
      (mesh instanceof THREE.SkinnedMesh ||
        mesh.morphTargetInfluences?.some((value) => value !== 0))
    ) {
      if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
      const posed = new Float32Array(previewPosition.count * 3);
      const point = new THREE.Vector3();
      for (let i = 0; i < previewPosition.count; i++)
        mesh.getVertexPosition(i, point).toArray(posed, i * 3);
      previewPosition = new THREE.BufferAttribute(posed, 3);
    }
    objects.push({
      object,
      name,
      geometry: mesh?.geometry,
      previewPosition,
      materials: mesh ? meshMaterials(mesh) : [],
      matrix: inverse.clone().multiply(object.matrixWorld),
      // Mesh bounds below follow the loaded pose; group bounds
      // include descendants and only serve transform navigation.
      bounds: new THREE.Box3(),
      nonUniformScale:
        Math.abs(s.x - s.y) > 0.001 || Math.abs(s.y - s.z) > 0.001 || Math.abs(s.x - s.z) > 0.001,
    });
  });
  for (const entry of objects) {
    const position = entry.previewPosition;
    if (position) {
      const p = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i).applyMatrix4(entry.matrix);
        if ([p.x, p.y, p.z].every(Number.isFinite)) entry.bounds.expandByPoint(p);
      }
      if (entry.object instanceof THREE.InstancedMesh)
        entry.bounds.copy(new THREE.Box3().setFromObject(entry.object).applyMatrix4(inverse));
    }
  }
  // Bottom-up union avoids repeatedly traversing the geometry of nested groups.
  const byObject = new Map(objects.map((entry) => [entry.object, entry]));
  for (let i = objects.length - 1; i >= 0; i--) {
    const entry = objects[i];
    if (entry.object.parent) byObject.get(entry.object.parent)?.bounds.union(entry.bounds);
  }
  return { model, objects, failedResources: [...failedResources] };
}

function bindings(entry: InspectionObject) {
  return entry.materials.flatMap((material, index) =>
    Object.entries(material)
      .filter((pair): pair is [string, THREE.Texture] => pair[1] instanceof THREE.Texture)
      .map(([slot, texture]) => ({
        material: material.name || `Material ${index + 1}`,
        slot,
        texture,
      }))
  );
}
function resolution(texture: THREE.Texture) {
  const data: unknown = texture.source?.data;
  const sizes = (Array.isArray(data) ? data : [data]).map(imageResolution);
  const known = sizes.filter((size): size is number => size !== null);
  return { max: known.length ? Math.max(...known) : null, partial: sizes.some((s) => s === null) };
}
function bindingDetail(binding: ReturnType<typeof bindings>[number]) {
  const { material, slot, texture } = binding;
  const size = resolution(texture);
  const uv =
    texture.mapping === THREE.UVMapping ? `UV ${texture.channel}` : "generated coordinates";
  const name = texture.name ? ` · ${texture.name}` : "";
  return `${material} · ${slot}${name} · ${uv} · ${size.max === null ? "size unknown" : `${size.max}px${size.partial ? " (partial)" : ""}`}`;
}

/** Same predicates as validation; only selected checks allocate overlay vertices. */
export function inspectIssue(source: InspectionSource, item: ValidationItem): IssueSelection {
  const targets: InspectionTarget[] = [];
  const kind = item.inspection;
  if (kind === "failed-resources" || !kind) return { source, item, targets, targetIndex: 0 };
  // Keep picking responsive even for very large defective meshes. Counts and
  // bounds remain complete; the UI explicitly discloses a partial overlay.
  let remainingPrimitives = 20_000;
  for (const entry of source.objects) {
    const geometry = entry.geometry;
    const position = entry.previewPosition;
    const points: number[] = [];
    const bounds = new THREE.Box3();
    const p = new THREE.Vector3();
    let count = 0;
    let truncated = false;
    let primitive: InspectionTarget["primitive"] = "bounds";
    let unit: InspectionTarget["unit"] = "mesh";
    const details: string[] = [];
    const append = (indices: number[]) => {
      if (!position) return;
      count++;
      const retain = remainingPrimitives > 0;
      const primitivePoints: number[] = [];
      for (const i of indices) {
        p.fromBufferAttribute(position, i).applyMatrix4(entry.matrix);
        if (![p.x, p.y, p.z].every(Number.isFinite)) continue;
        bounds.expandByPoint(p);
        if (retain) primitivePoints.push(p.x, p.y, p.z);
      }
      if (retain && primitivePoints.length === indices.length * 3) {
        points.push(...primitivePoints);
        remainingPrimitives--;
      } else if (retain) {
        if (!details.includes("Non-finite vertices cannot be highlighted."))
          details.push("Non-finite vertices cannot be highlighted.");
      } else truncated = true;
    };
    if (geometry && position) {
      const { getIndices } = getTriangleIndices(geometry);
      if (kind === "open-edges" || kind === "non-manifold") {
        primitive = "edges";
        unit = "edges";
        analyzeEdges(geometry, (a, b, incidence) => {
          if (kind === "open-edges" ? incidence === 1 : incidence > 2) append([a, b]);
        });
      } else if (kind === "degenerate") {
        primitive = "triangles";
        unit = "triangles";
        countDegenerateTriangles(geometry, (i) => append(getIndices(i)));
      } else if (kind === "normal-mismatch" || kind === "unchecked-normals") {
        primitive = "triangles";
        unit = "triangles";
        analyzeNormalConsistency(geometry, (i, status) => {
          if (status === (kind === "normal-mismatch" ? "mismatch" : "unchecked"))
            append(getIndices(i));
        });
      } else if (kind === "missing-uv" && uvChannels(geometry).length === 0) {
        count = 1;
        details.push("No UV channels. Check whether this surface needs UV-mapped textures.");
      } else if (kind === "required-uv") {
        const channels = uvChannels(geometry);
        const missing = bindings(entry).filter(
          ({ texture }) =>
            texture.mapping === THREE.UVMapping && !channels.includes(texture.channel)
        );
        if (missing.length) {
          count = 1;
          details.push(...missing.map((binding) => `${bindingDetail(binding)} · channel missing`));
        }
      } else if (kind === "no-material" && entry.materials.length === 0) {
        count = 1;
        details.push("No material assigned to the rendered geometry groups.");
      } else if (kind === "textures" || kind === "texture-resolution") {
        const selected = bindings(entry).filter(({ texture }) =>
          kind === "texture-resolution" && item.severity === "warning"
            ? (resolution(texture).max ?? 0) > 4096
            : true
        );
        if (selected.length) {
          count = 1;
          details.push(...selected.map(bindingDetail));
        }
      }
    }
    if (kind === "non-uniform-scale" && entry.nonUniformScale) {
      count = 1;
      unit = "object";
      const s = entry.object.scale;
      details.push(`Local scale: ${s.x} × ${s.y} × ${s.z}`);
    }
    if (count > 0) {
      if (entry.object instanceof THREE.InstancedMesh) {
        primitive = "bounds";
        details.push(
          "Instanced object: the box covers all instances. Counts describe shared geometry; individual faces are not highlighted."
        );
      }
      if (primitive === "bounds") bounds.copy(entry.bounds);
      if (!details.length)
        details.push(
          ...entry.materials.map((m, i) => `Material: ${m.name || `Material ${i + 1}`}`)
        );
      targets.push({
        id: entry.object.uuid,
        name: entry.name,
        count,
        unit,
        details,
        bounds,
        positions: new Float32Array(points),
        primitive,
        truncated,
      });
    }
  }
  return { source, item, targets, targetIndex: 0 };
}
