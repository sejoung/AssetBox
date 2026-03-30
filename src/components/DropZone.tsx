import { useState, useCallback } from "react";

interface DropZoneProps {
  onFileDrop: (files: File[]) => void;
  hasFile: boolean;
  children?: React.ReactNode;
}

export function DropZone({ onFileDrop, hasFile, children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFileDrop(files);
      }
    },
    [onFileDrop]
  );

  return (
    <div
      data-testid="drop-zone"
      className={`relative w-full h-full ${isDragOver ? "drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!hasFile && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
          <div
            className={`
              border-2 border-dashed rounded-2xl p-12 transition-all duration-200
              ${isDragOver ? "border-[var(--accent)] bg-[var(--accent)]/10 scale-105" : "border-[var(--border)]"}
            `}
          >
            <div className="text-center">
              <svg
                className="mx-auto mb-4 w-16 h-16"
                style={{ color: isDragOver ? "var(--accent)" : "var(--text-secondary)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Drag & Drop 3D File
              </p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Supports FBX, GLB, OBJ formats
              </p>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
