import { useEffect, useRef } from "react";

/**
 * Forwards every dropped path to the caller — including directories, which the
 * tree uses as its new root. Classification happens in App, where the tree
 * state lives.
 */
export function useFileDropHandler(onFiles: (paths: string[]) => void) {
  const callback = useRef(onFiles);
  callback.current = onFiles;
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    async function setup() {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        if (disposed) return;
        const appWindow = getCurrentWebviewWindow();
        const unlistenFn = await appWindow.onDragDropEvent((event) => {
          if (!disposed && event.payload.type === "drop" && event.payload.paths.length > 0) {
            callback.current(event.payload.paths);
          }
        });
        if (disposed) unlistenFn();
        else unlisten = unlistenFn;
      } catch {
        // Not running in Tauri environment (e.g., during tests)
      }
    }

    setup();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
