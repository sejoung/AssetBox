import * as THREE from "three";

export function getTriangleIndices(geometry: THREE.BufferGeometry) {
  const index = geometry.index;
  const count = index?.count ?? geometry.attributes.position?.count ?? 0;
  return {
    triCount: Math.floor(count / 3),
    getIndices: (i: number): [number, number, number] =>
      index
        ? [index.getX(i * 3), index.getX(i * 3 + 1), index.getX(i * 3 + 2)]
        : [i * 3, i * 3 + 1, i * 3 + 2],
  };
}

/** Scale-independent area test. Small but well-shaped models are not degenerate. */
export function isDegenerateTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const abx = b.x - a.x,
    aby = b.y - a.y,
    abz = b.z - a.z;
  const acx = c.x - a.x,
    acy = c.y - a.y,
    acz = c.z - a.z;
  const scale = Math.max(
    Math.abs(abx),
    Math.abs(aby),
    Math.abs(abz),
    Math.abs(acx),
    Math.abs(acy),
    Math.abs(acz)
  );
  if (!Number.isFinite(scale) || scale === 0) return true;
  const ux = abx / scale,
    uy = aby / scale,
    uz = abz / scale;
  const vx = acx / scale,
    vy = acy / scale,
    vz = acz / scale;
  return (
    (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2 <=
    Number.EPSILON ** 2
  );
}

export function countDegenerateTriangles(
  geometry: THREE.BufferGeometry,
  onTriangle?: (index: number) => void
) {
  const position = geometry.attributes.position;
  if (!position) return 0;
  const { triCount, getIndices } = getTriangleIndices(geometry);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  let count = 0;
  for (let i = 0; i < triCount; i++) {
    const [ia, ib, ic] = getIndices(i);
    if (
      isDegenerateTriangle(
        a.fromBufferAttribute(position, ia),
        b.fromBufferAttribute(position, ib),
        c.fromBufferAttribute(position, ic)
      )
    ) {
      count++;
      onTriangle?.(i);
    }
  }
  return count;
}

/**
 * Compare exact positions within one mesh, without mutating its render vertices.
 * UV/normal seams may duplicate vertices. No epsilon welding: nearby intentional
 * gaps must stay open. This detects edge incidence, not watertightness or volume.
 */
export function analyzeEdges(
  geometry: THREE.BufferGeometry,
  onEdge?: (start: number, end: number, incidence: number) => void
) {
  const position = geometry.attributes.position;
  if (!position) return { nonManifold: 0, openEdges: 0 };
  const canonical = new Map<string, number>();
  const ids: number[] = [];
  const representatives: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
    if (!canonical.has(key)) {
      canonical.set(key, canonical.size);
      representatives.push(i);
    }
    ids.push(canonical.get(key)!);
  }
  const edges = new Map<string, number>();
  const { triCount, getIndices } = getTriangleIndices(geometry);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < triCount; i++) {
    const indices = getIndices(i);
    if (
      isDegenerateTriangle(
        a.fromBufferAttribute(position, indices[0]),
        b.fromBufferAttribute(position, indices[1]),
        c.fromBufferAttribute(position, indices[2])
      )
    )
      continue;
    const [ia, ib, ic] = indices.map((index) => ids[index]);
    for (const [start, end] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ]) {
      const key = start < end ? `${start}_${end}` : `${end}_${start}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let nonManifold = 0,
    openEdges = 0;
  for (const [key, count] of edges) {
    if (onEdge && count !== 2) {
      const [a, b] = key.split("_").map(Number);
      onEdge(representatives[a], representatives[b], count);
    }
    if (count > 2) nonManifold++;
    if (count === 1) openEdges++;
  }
  return { nonManifold, openEdges };
}

/** Winding versus vertex normals; deliberately does not infer inside/outside. */
export function analyzeNormalConsistency(
  geometry: THREE.BufferGeometry,
  onTriangle?: (index: number, kind: "mismatch" | "unchecked") => void
) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const { triCount, getIndices } = getTriangleIndices(geometry);
  const vertices = new Set<number>();
  let mismatches = 0,
    unchecked = 0;
  if (!position || !normal) {
    if (onTriangle) for (let i = 0; i < triCount; i++) onTriangle(i, "unchecked");
    return { mismatches, unchecked: triCount, vertices };
  }
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const face = new THREE.Vector3(),
    edge = new THREE.Vector3(),
    average = new THREE.Vector3();
  const na = new THREE.Vector3(),
    nb = new THREE.Vector3(),
    nc = new THREE.Vector3();
  for (let i = 0; i < triCount; i++) {
    const [ia, ib, ic] = getIndices(i);
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    if (isDegenerateTriangle(a, b, c)) {
      unchecked++;
      onTriangle?.(i, "unchecked");
      continue;
    }
    face.subVectors(b, a).normalize().cross(edge.subVectors(c, a).normalize()).normalize();
    na.fromBufferAttribute(normal, ia);
    nb.fromBufferAttribute(normal, ib);
    nc.fromBufferAttribute(normal, ic);
    average.copy(na).add(nb).add(nc);
    if (
      ![na, nb, nc].every((n) => Number.isFinite(n.lengthSq()) && n.lengthSq() > 0) ||
      average.lengthSq() === 0
    ) {
      unchecked++;
      onTriangle?.(i, "unchecked");
      continue;
    }
    if (face.dot(average.normalize()) < -1e-6) {
      mismatches++;
      onTriangle?.(i, "mismatch");
      vertices.add(ia);
      vertices.add(ib);
      vertices.add(ic);
    }
  }
  return { mismatches, unchecked, vertices };
}

export function uvChannels(geometry: THREE.BufferGeometry): number[] {
  return Object.keys(geometry.attributes)
    .filter((name) => /^uv(?:[1-9]\d*)?$/.test(name))
    .filter(
      (name) =>
        geometry.attributes[name].count === geometry.attributes.position?.count &&
        geometry.attributes[name].itemSize >= 2
    )
    .map((name) => (name === "uv" ? 0 : Number(name.slice(2))));
}
