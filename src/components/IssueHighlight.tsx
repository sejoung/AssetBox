import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { IssueSelection } from "../lib/issueInspection";

import { focusIssueBounds } from "../lib/focusIssueBounds";

export function IssueHighlight({ selection }: { selection: IssueSelection }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, controls, invalidate, size } = useThree();
  useEffect(() => {
    const group = groupRef.current;
    const target = selection.targets[selection.targetIndex];
    if (!group || !target) return;
    const { model } = selection.source;
    model.updateWorldMatrix(true, true);
    group.matrix.copy(model.matrixWorld);
    const ownedGeometries: THREE.BufferGeometry[] = [];
    const ownedMaterials: THREE.Material[] = [];
    const color = 0xffbf47;
    if (target.primitive === "bounds" || !target.positions.length) {
      const entry = selection.source.objects.find((o) => o.object.uuid === target.id);
      if (
        entry?.geometry &&
        entry.previewPosition &&
        !(entry.object instanceof THREE.InstancedMesh) &&
        target.primitive === "bounds"
      ) {
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        ownedMaterials.push(material);
        const geometry = new THREE.BufferGeometry();
        // Own GPU attributes as well: disposing an overlay must not invalidate
        // buffers that the source model is still rendering.
        geometry.setAttribute("position", entry.previewPosition.clone());
        geometry.setIndex(entry.geometry.index?.clone() ?? null);
        ownedGeometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(entry.matrix);
        mesh.renderOrder = 100;
        group.add(mesh);
      }
      if (!target.bounds.isEmpty()) {
        const helper = new THREE.Box3Helper(target.bounds, color);
        const material = helper.material as THREE.LineBasicMaterial;
        material.depthTest = false;
        material.depthWrite = false;
        material.toneMapped = false;
        ownedGeometries.push(helper.geometry);
        ownedMaterials.push(material);
        helper.renderOrder = 101;
        group.add(helper);
      }
    } else if (target.positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(target.positions, 3));
      ownedGeometries.push(geometry);
      if (target.primitive === "triangles") {
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.65,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        ownedMaterials.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 100;
        group.add(mesh);
      }
      const lineGeometry =
        target.primitive === "edges" ? geometry : new THREE.WireframeGeometry(geometry);
      if (lineGeometry !== geometry) ownedGeometries.push(lineGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      ownedMaterials.push(lineMaterial);
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
      lines.renderOrder = 101;
      group.add(lines);
      // Points keep collapsed triangles and thin/edge-on regions visible.
      const pointMaterial = new THREE.PointsMaterial({
        color,
        size: 4,
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      ownedMaterials.push(pointMaterial);
      const points = new THREE.Points(geometry, pointMaterial);
      points.renderOrder = 102;
      group.add(points);
    }
    focusIssueBounds(
      camera as THREE.PerspectiveCamera,
      controls as Parameters<typeof focusIssueBounds>[1],
      target.bounds.clone().applyMatrix4(model.matrixWorld),
      new THREE.Box3().setFromObject(model)
    );
    invalidate();
    return () => {
      group.clear();
      ownedGeometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
    };
  }, [selection, camera, controls, invalidate, size.width, size.height]);
  return <group ref={groupRef} matrixAutoUpdate={false} />;
}
