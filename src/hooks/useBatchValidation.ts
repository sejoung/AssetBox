import { useCallback, useMemo, useRef, useState } from "react";
import { listDirectory } from "./useTauriCommand";
import { loadModel } from "../components/ModelLoader";
import { disposeScene } from "../lib/disposeScene";
import { inspectModel } from "../lib/assetPipeline";
import { baseName } from "../lib/fileTree";
import type { ValidationSeverity } from "../types/asset";
import * as log from "../lib/logger";

const MAX_DEPTH = 8;

export interface BatchProgress {
  running: boolean;
  done: number;
  total: number;
  current: string | null;
}

const IDLE: BatchProgress = { running: false, done: 0, total: 0, current: null };

/** Depth-limited recursive walk collecting every model under `dir`. */
async function collectModels(dir: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  const entries = await listDirectory(dir, true);
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isDir) {
      paths.push(...(await collectModels(entry.path, depth + 1)));
    } else if (entry.kind === "model") {
      paths.push(entry.path);
    }
  }
  return paths;
}

/**
 * Grades every model under the tree root without rendering it — the loaders and
 * the analysis are pure three.js, so no viewport is involved. Runs strictly
 * sequentially and disposes each scene before the next load, which keeps peak
 * memory at one model regardless of folder size.
 */
export function useBatchValidation(onResult: (path: string, severity: ValidationSeverity) => void) {
  const [progress, setProgress] = useState<BatchProgress>(IDLE);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const run = useCallback(
    async (root: string) => {
      cancelRef.current = false;
      setProgress({ running: true, done: 0, total: 0, current: "Scanning..." });

      let paths: string[];
      try {
        paths = await collectModels(root);
      } catch (err) {
        log.error("Batch validation scan failed:", err);
        setProgress(IDLE);
        return;
      }

      setProgress({ running: true, done: 0, total: paths.length, current: null });

      for (let i = 0; i < paths.length; i++) {
        if (cancelRef.current) break;
        const path = paths[i];
        setProgress({ running: true, done: i, total: paths.length, current: baseName(path) });

        try {
          const model = await loadModel(path);
          try {
            const { validation } = await inspectModel(path, model);
            onResult(path, validation.overall);
          } finally {
            disposeScene(model.scene);
          }
        } catch (err) {
          log.warn(`Batch validation skipped ${path}:`, err);
        }

        // Yield so the UI can paint progress and stay responsive.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      setProgress(IDLE);
    },
    [onResult]
  );

  return useMemo(() => ({ progress, run, cancel }), [progress, run, cancel]);
}
