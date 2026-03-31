import type { TextureType, TextureInfo } from "../types/asset";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "tga", "tiff", "tif", "bmp", "exr"]);

const TEXTURE_PATTERNS: [TextureType, RegExp][] = [
  ["basecolor", /[_\-.](?:basecolor|diffuse|albedo|color|col|diff)$/i],
  ["normal", /[_\-.](?:normal|nrm|norm|nml)$/i],
  ["roughness", /[_\-.](?:roughness|rough|rgh)$/i],
  ["metallic", /[_\-.](?:metallic|metalness|metal|mtl)$/i],
  ["ao", /[_\-.](?:ao|ambientocclusion|occlusion|occ)$/i],
  ["emissive", /[_\-.](?:emissive|emission|emit)$/i],
  ["height", /[_\-.](?:height|displacement|disp|bump)$/i],
  ["opacity", /[_\-.](?:opacity|alpha|transparency)$/i],
];

export function matchTextureType(fileName: string): TextureType {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");

  for (const [type, pattern] of TEXTURE_PATTERNS) {
    if (pattern.test(nameWithoutExt)) {
      return type;
    }
  }

  return "unknown";
}

export function findTexturesInFileList(filePaths: string[]): TextureInfo[] {
  const textures: TextureInfo[] = [];

  for (const filePath of filePaths) {
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const type = matchTextureType(fileName);
    if (type === "unknown") continue;

    textures.push({
      type,
      fileName,
      filePath,
      resolution: null,
    });
  }

  return textures;
}
