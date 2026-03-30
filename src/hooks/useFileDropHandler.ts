import { useEffect } from "react";

const SUPPORTED_EXTENSIONS = new Set(["fbx", "glb", "gltf", "obj"]);

export function useFileDropHandler(onFiles: (paths: string[]) => void) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    async function setup() {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const appWindow = getCurrentWebviewWindow();
        const unlistenFn = await appWindow.onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            const paths = event.payload.paths.filter((p: string) => {
              const ext = p.split(".").pop()?.toLowerCase() ?? "";
              return SUPPORTED_EXTENSIONS.has(ext);
            });
            if (paths.length > 0) {
              onFiles(paths);
            }
          }
        });
        unlisten = unlistenFn;
      } catch {
        // Not running in Tauri environment (e.g., during tests)
      }
    }

    setup();

    return () => {
      unlisten?.();
    };
  }, [onFiles]);
}
