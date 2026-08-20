import { useEffect } from "react";

/**
 * Forwards every dropped path to the caller — including directories, which the
 * tree uses as its new root. Classification happens in App, where the tree
 * state lives.
 */
export function useFileDropHandler(onFiles: (paths: string[]) => void) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    async function setup() {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const appWindow = getCurrentWebviewWindow();
        const unlistenFn = await appWindow.onDragDropEvent((event) => {
          if (event.payload.type === "drop" && event.payload.paths.length > 0) {
            onFiles(event.payload.paths);
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
