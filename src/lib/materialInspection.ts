import * as THREE from "three";

export interface TextureInspection {
  count: number;
  maxResolution: number | null;
  unknownResolutions: number;
  /** OBJLoader does not resolve MTL files, so its texture inventory is unknown. */
  referencesVerified: boolean;
  failedResources: string[];
}

/** Only material slots actually used by geometry groups require UV bindings. */
export function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  if (!Array.isArray(mesh.material)) return mesh.material ? [mesh.material] : [];
  const slots = new Set(
    mesh.geometry.groups.filter((group) => group.count > 0).map((group) => group.materialIndex ?? 0)
  );
  return [...slots].map((slot) => (mesh.material as THREE.Material[])[slot]).filter(Boolean);
}

export function materialTextures(material: THREE.Material): THREE.Texture[] {
  return Object.values(material).filter(
    (value): value is THREE.Texture => value instanceof THREE.Texture
  );
}

export function imageResolution(image: unknown): number | null {
  if (!image || typeof image !== "object") return null;
  const data = image as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
  };
  const width = data.naturalWidth || data.videoWidth || data.width;
  const height = data.naturalHeight || data.videoHeight || data.height;
  return width &&
    height &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
    ? Math.max(width, height)
    : null;
}

export function inspectTextures(
  scene: THREE.Object3D,
  referencesVerified: boolean,
  failedResources: string[] = []
): TextureInspection {
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = meshMaterials(object);
    for (const material of materials)
      if (material) for (const texture of materialTextures(material)) textures.add(texture);
  });
  let maxResolution: number | null = null,
    unknownResolutions = 0;
  for (const texture of textures) {
    const data: unknown = texture.source?.data;
    const images: unknown[] = Array.isArray(data) ? data : [data];
    const sizes = images.map(imageResolution);
    if (!sizes.length || sizes.some((size) => size === null)) unknownResolutions++;
    for (const size of sizes) if (size !== null) maxResolution = Math.max(maxResolution ?? 0, size);
  }
  return {
    count: textures.size,
    maxResolution,
    unknownResolutions,
    referencesVerified,
    failedResources: [...new Set(failedResources)],
  };
}
