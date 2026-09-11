import * as THREE from "three";

// Resource URLs must be resolved before Tauri encodes the *whole* filesystem
// path. A private base keeps Three's relative URL handling independent of the
// platform-specific asset protocol, including on Windows.
export const LOCAL_RESOURCE_BASE = "assetbox-resource:///";

export function localResourceResolver(
  modelPath: string,
  convert: (path: string) => string,
  uriEncoded = true
): (url: string) => string {
  const normalized = modelPath.replace(/\\/g, "/");
  const directory = normalized.slice(0, normalized.lastIndexOf("/") + 1);
  return (url) => {
    if (!url.startsWith(LOCAL_RESOURCE_BASE)) return url;
    let resource = url.slice(LOCAL_RESOURCE_BASE.length).replace(/\\/g, "/");
    if (/^(https?:)?\/\//i.test(resource) || /^(data|blob):/i.test(resource)) return resource;
    // glTF URIs are encoded; FBX filenames are literal filesystem names.
    if (uriEncoded) {
      try {
        resource = decodeURIComponent(resource);
      } catch {
        // Keep literal percent characters in exporters' non-URI filenames.
      }
    }
    const absolute = /^(\/|[a-z]:\/)/i.test(resource) ? resource : directory + resource;
    const segments: string[] = [];
    for (const segment of absolute.split("/")) {
      if (segment === ".") continue;
      if (segment === ".." && segments.length > 1) segments.pop();
      else if (segment !== "..") segments.push(segment);
    }
    return convert(segments.join("/"));
  };
}

/** Configure the actual loader and manager together, so no dependency escapes
 * through a base URL that has already been encoded by the native bridge. */
export function configureLocalResources(
  loader: THREE.Loader,
  modelPath: string,
  convert: (path: string) => string,
  uriEncoded: boolean
): void {
  loader.setResourcePath(LOCAL_RESOURCE_BASE);
  loader.manager.setURLModifier(localResourceResolver(modelPath, convert, uriEncoded));
}
