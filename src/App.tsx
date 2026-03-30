import { useState, useCallback, useRef } from "react";
import "./App.css";
import { DropZone } from "./components/DropZone";
import { Viewer3D, type Viewer3DHandle } from "./components/Viewer3D";
import { InfoPanel } from "./components/InfoPanel";
import { useFileDropHandler } from "./hooks/useFileDropHandler";
import { validateAsset } from "./hooks/useAssetValidation";
import { buildAssetInfo } from "./components/TextureMatcher";
import type { AssetInfo, ValidationResult } from "./types/asset";
import type { LoadedModel } from "./components/ModelLoader";

function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<Viewer3DHandle>(null);

  const handleFileDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (file) {
      setError(null);
      const path = (file as File & { path?: string }).path ?? file.name;
      setFilePath(path);
    }
  }, []);

  useFileDropHandler(
    useCallback((paths: string[]) => {
      setError(null);
      setFilePath(paths[0]);
    }, [])
  );

  const handleModelLoaded = useCallback(
    async (model: LoadedModel) => {
      if (!filePath) return;

      try {
        const info = await buildAssetInfo(filePath, model);
        setAsset(info);

        const result = validateAsset({
          polyCount: info.polyCount,
          vertexCount: info.vertexCount,
          meshCount: info.meshCount,
          fileSize: info.fileSize,
          textureCount: info.textures.length,
          missingTextureCount: info.missingTextures.length,
          maxTextureRes: 2048,
          diagnostics: model.diagnostics,
        });
        setValidation(result);
      } catch (err) {
        console.error("Failed to build asset info:", err);
      }
    },
    [filePath]
  );

  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setAsset(null);
    setValidation(null);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Full-screen viewport */}
      <DropZone onFileDrop={handleFileDrop} hasFile={!!filePath}>
        {filePath && (
          <Viewer3D
            ref={viewerRef}
            filePath={filePath}
            onModelLoaded={handleModelLoaded}
            onError={handleError}
          />
        )}
      </DropZone>

      {/* Overlay UI */}
      <InfoPanel asset={asset} validation={validation} viewerRef={viewerRef} assetPath={filePath} />

      {/* Error toast */}
      {error && (
        <div
          className="absolute bottom-3 left-3 z-20 px-3 py-2 rounded-lg text-xs"
          style={{
            backgroundColor: "rgba(248, 113, 113, 0.15)",
            backdropFilter: "blur(12px)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
