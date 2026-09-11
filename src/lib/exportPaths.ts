/** Keep the source extension so chair.fbx and chair.glb never share outputs. */
export function exportPath(assetPath: string, kind: "thumbnail" | "report"): string {
  return `${assetPath}_${kind}.${kind === "thumbnail" ? "png" : "html"}`;
}
