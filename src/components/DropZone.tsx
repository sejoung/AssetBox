import { useState, useCallback } from "react";

interface DropZoneProps {
  onFileDrop: (files: File[]) => void;
  hasFile: boolean;
  onOpenFolder?: () => void;
  hasFolder?: boolean;
  children?: React.ReactNode;
}

export function DropZone({
  onFileDrop,
  hasFile,
  onOpenFolder,
  hasFolder,
  children,
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) onFileDrop(files);
    },
    [onFileDrop]
  );

  return (
    <div
      data-testid="drop-zone"
      className={`drop-zone ${isDragOver ? "drag-over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {!hasFile && (
        <div className="welcome">
          <div className="welcome-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M3 8l9 4m0 0v9M7.5 5.5l9 5" />
            </svg>
          </div>
          <span className="section-label">Your assets, in focus</span>
          <h1>{hasFolder ? "Select a model to preview" : "A closer look at your 3D assets"}</h1>
          <p>
            {hasFolder
              ? "Choose a file from the list to inspect its geometry, textures and quality."
              : "Open a folder to browse, preview and check your models in one place."}
          </p>
          {onOpenFolder && (
            <button className="ui-button primary-button" onClick={onOpenFolder}>
              Open folder <span aria-hidden="true">↗</span>
            </button>
          )}
          <p className="drop-hint">or drag & drop a 3D file or folder here</p>
          <span className="format-list">FBX · GLB · glTF · OBJ</span>
        </div>
      )}
      {children}
      {isDragOver && (
        <div className="drop-overlay" aria-hidden="true">
          Drop to open
        </div>
      )}
    </div>
  );
}
