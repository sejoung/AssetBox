import { useState } from "react";
import type { AssetInfo, ValidationResult, ValidationItem, ValidationGroup } from "../types/asset";
import { ValidationBadge } from "./ValidationBadge";
import type { Viewer3DHandle } from "./Viewer3D";
import { ThumbnailButton } from "./ThumbnailButton";
import { ReportButton } from "./ReportButton";
import { LogButton } from "./LogButton";
import { OVERLAY_BG, OVERLAY_BORDER, OVERLAY_BACKDROP } from "../lib/overlayStyle";

interface InfoPanelProps {
  asset: AssetInfo | null;
  validation: ValidationResult | null;
  viewerRef: React.RefObject<Viewer3DHandle | null>;
  assetPath: string | null;
}

function StatRow({ item }: { item: ValidationItem }) {
  const color =
    item.severity === "good" ? "#4ade80" : item.severity === "warning" ? "#fbbf24" : "#f87171";

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-1">
        <span className="text-xs leading-relaxed whitespace-nowrap" style={{ color: "#a0a0b0" }}>
          {item.label}
        </span>
        <span
          className="text-xs leading-relaxed font-mono font-semibold whitespace-nowrap"
          style={{ color }}
        >
          {item.value}
        </span>
      </div>
      {item.severity !== "good" && item.threshold && (
        <p className="text-[10px] leading-relaxed mb-0.5 pl-0.5" style={{ color: "#707080" }}>
          {item.threshold}
        </p>
      )}
    </div>
  );
}

function CategoryGroup({ group }: { group: ValidationGroup }) {
  const groupWorst = group.items.some((i) => i.severity === "bad")
    ? "#f87171"
    : group.items.some((i) => i.severity === "warning")
      ? "#fbbf24"
      : undefined;

  return (
    <div className="rounded-lg" style={{ backgroundColor: "rgba(20, 20, 40, 0.6)" }}>
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: "rgba(50, 50, 80, 0.5)", borderRadius: "8px 8px 0 0" }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wider leading-relaxed"
          style={{ color: "#b0b0c0" }}
        >
          {group.label}
        </span>
        {groupWorst && (
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: groupWorst }} />
        )}
      </div>
      <div className="px-4 py-2.5 space-y-0.5">
        {group.items.map((item) => (
          <StatRow key={item.label} item={item} />
        ))}
      </div>
    </div>
  );
}

export function InfoPanel({ asset, validation, viewerRef, assetPath }: InfoPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!asset) return null;

  return (
    <>
      {/* Top-left: File name + badge */}
      <div
        className="absolute top-4 left-4 z-20 flex items-center gap-2 min-w-0"
        style={{ maxWidth: "calc(100% - 310px)" }}
      >
        <span
          className="px-3 py-2 rounded-lg text-xs font-mono uppercase font-bold tracking-wider shrink-0 leading-relaxed"
          style={{
            backgroundColor: OVERLAY_BG,
            color: "#e94560",
            border: OVERLAY_BORDER,
            backdropFilter: OVERLAY_BACKDROP,
          }}
        >
          {asset.format}
        </span>
        <span
          className="px-4 py-2 rounded-lg text-sm font-semibold truncate min-w-0 leading-relaxed"
          style={{
            backgroundColor: OVERLAY_BG,
            color: "#eaeaea",
            border: OVERLAY_BORDER,
            backdropFilter: OVERLAY_BACKDROP,
          }}
          title={asset.fileName}
        >
          {asset.fileName}
        </span>
        {validation && (
          <span className="shrink-0">
            <ValidationBadge severity={validation.overall} />
          </span>
        )}
      </div>

      {/* Top-right: Collapsible stats panel */}
      <div
        className="absolute top-4 right-4 z-20 rounded-xl"
        style={{
          backgroundColor: OVERLAY_BG,
          backdropFilter: OVERLAY_BACKDROP,
          border: OVERLAY_BORDER,
          width: collapsed ? "auto" : "290px",
          maxHeight: collapsed ? "auto" : "calc(100vh - 100px)",
          overflowY: collapsed ? "visible" : "auto",
        }}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-xs font-semibold uppercase tracking-wider leading-relaxed cursor-pointer hover:bg-white/5 transition-colors rounded-t-xl sticky top-0"
          style={{ color: "#b0b0c0", backgroundColor: OVERLAY_BG }}
        >
          <span>Info</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {!collapsed && validation && (
          <div className="px-3 pb-4 space-y-2.5">
            {validation.groups.map((group) => (
              <CategoryGroup key={group.category} group={group} />
            ))}

            {asset.textures.length > 0 && (
              <div className="rounded-lg" style={{ backgroundColor: "rgba(20, 20, 40, 0.6)" }}>
                <div
                  className="px-4 py-2.5"
                  style={{ backgroundColor: "rgba(50, 50, 80, 0.5)", borderRadius: "8px 8px 0 0" }}
                >
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider leading-relaxed"
                    style={{ color: "#b0b0c0" }}
                  >
                    Texture Files
                  </span>
                </div>
                <div className="px-4 py-2.5 space-y-1.5">
                  {asset.textures.map((tex) => (
                    <div
                      key={tex.filePath}
                      className="flex items-center gap-2 text-[11px] leading-relaxed min-w-0"
                    >
                      <span
                        className="font-mono uppercase shrink-0"
                        style={{ color: "#e94560", minWidth: "45px" }}
                      >
                        {tex.type.slice(0, 5)}
                      </span>
                      <span
                        className="truncate min-w-0"
                        style={{ color: "#eaeaea" }}
                        title={tex.fileName}
                      >
                        {tex.fileName}
                      </span>
                    </div>
                  ))}
                  {asset.missingTextures.length > 0 && (
                    <p className="text-[10px] leading-relaxed pt-1" style={{ color: "#fbbf24" }}>
                      Missing: {asset.missingTextures.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-right: Action buttons */}
      <div className="absolute bottom-5 right-5 z-20 flex gap-3">
        <LogButton />
        <ReportButton asset={asset} validation={validation} />
        <ThumbnailButton viewerRef={viewerRef} assetPath={assetPath} />
      </div>
    </>
  );
}
