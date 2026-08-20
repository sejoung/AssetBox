import { memo } from "react";
import type { EntryKind } from "../hooks/useTauriCommand";

const FORMAT_COLORS: Record<string, string> = {
  glb: "#8b5cf6",
  gltf: "#8b5cf6",
  fbx: "#e94560",
  obj: "#3b82f6",
};

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5 transition-transform duration-150"
      style={{ transform: open ? "rotate(90deg)" : "none", color: "#8a8aa0" }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Format-coloured cube for models, image glyph for textures, sheet otherwise. */
export const FileIcon = memo(function FileIcon({
  name,
  kind,
  isDir,
}: {
  name: string;
  kind: EntryKind;
  isDir: boolean;
}) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#7a7a95" aria-hidden="true">
        <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }

  if (kind === "model") {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return (
      <svg
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke={FORMAT_COLORS[ext] ?? "#8b5cf6"}
        strokeWidth={1.8}
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2.6l8 4.4v9.9l-8 4.5-8-4.5V7z" />
        <path d="M4 7l8 4.4L20 7M12 11.4V21" />
      </svg>
    );
  }

  if (kind === "texture") {
    return (
      <svg
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6a9a7a"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 16l-5-5-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#5a5a70"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
});
