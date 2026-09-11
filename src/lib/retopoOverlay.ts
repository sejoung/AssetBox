import * as THREE from "three";

/** Diagnostic colors live on disposable clones; source geometry stays intact. */
export function applyRetopoOverlay(model: THREE.Group) {
  const vA = new THREE.Vector3(),
    vB = new THREE.Vector3(),
    vC = new THREE.Vector3();
  const e1 = new THREE.Vector3(),
    e2 = new THREE.Vector3();

  // Pass 1: compute global average area (no arrays stored)
  let totalArea = 0;
  let totalTris = 0;
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const pos = child.geometry.attributes.position;
    if (!pos) return;
    const index = child.geometry.index;
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
      totalArea += e1.cross(e2).length() * 0.5;
    }
  });

  if (totalTris === 0) return;
  const globalAvg = totalArea / totalTris;

  // Pass 2: apply vertex colors per mesh using globalAvg
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const meshes: THREE.Mesh[] = [];
  const geometries = new Map<THREE.Mesh, THREE.BufferGeometry>();

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.geometry.attributes.position) return;
    geometries.set(child, child.geometry);
    const geo = child.geometry.clone();
    child.geometry = geo;
    const pos = geo.attributes.position;

    originals.set(child, child.material);
    meshes.push(child);

    const index = geo.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const posCount = pos.count;
    const colorAttr = new Float32Array(posCount * 3);
    const weightCount = new Float32Array(posCount);

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

      // Density score
      const areaRatio = globalAvg > 1e-10 ? area / globalAvg : 1;
      const score = Math.max(-3, Math.min(3, Math.log2(Math.max(areaRatio, 1e-6))));

      // Aspect ratio for thin triangle detection
      const edgeAB = vA.distanceTo(vB);
      const edgeBC = vB.distanceTo(vC);
      const edgeCA = vC.distanceTo(vA);
      const longest = Math.max(edgeAB, edgeBC, edgeCA);
      const shortest = Math.min(edgeAB, edgeBC, edgeCA);
      const aspectPenalty = Math.min((shortest > 1e-10 ? longest / shortest : 100) / 10, 1);

      let r: number, g: number, b2: number;
      if (score < 0) {
        const t = -score / 3;
        r = 0;
        g = 1 - t * 0.7;
        b2 = t;
      } else {
        const t = score / 3;
        r = t;
        g = 1 - t * 0.7;
        b2 = 0;
      }

      if (aspectPenalty > 0.3) {
        const blend = (aspectPenalty - 0.3) / 0.7;
        r = r + (1 - r) * blend * 0.7;
        g = g + (0.8 - g) * blend * 0.5;
        b2 = b2 * (1 - blend * 0.8);
      }

      colorAttr[a * 3] += r;
      colorAttr[a * 3 + 1] += g;
      colorAttr[a * 3 + 2] += b2;
      weightCount[a]++;
      colorAttr[b * 3] += r;
      colorAttr[b * 3 + 1] += g;
      colorAttr[b * 3 + 2] += b2;
      weightCount[b]++;
      colorAttr[c * 3] += r;
      colorAttr[c * 3 + 1] += g;
      colorAttr[c * 3 + 2] += b2;
      weightCount[c]++;
    }

    for (let i = 0; i < posCount; i++) {
      const w = weightCount[i] || 1;
      colorAttr[i * 3] /= w;
      colorAttr[i * 3 + 1] /= w;
      colorAttr[i * 3 + 2] /= w;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colorAttr, 3));
    child.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  });

  return () => {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      mesh.geometry = geometries.get(mesh)!;
      if (mesh.material instanceof THREE.MeshBasicMaterial) {
        mesh.material.dispose();
      }
      const orig = originals.get(mesh);
      if (orig) mesh.material = orig;
    }
  };
}
