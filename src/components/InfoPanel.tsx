import { memo, useState } from "react";
import type { AssetInfo, ValidationResult, ValidationItem, ValidationGroup } from "../types/asset";
import { ValidationBadge } from "./ValidationBadge";
import type { Viewer3DHandle } from "./Viewer3D";
import { ThumbnailButton } from "./ThumbnailButton";
import { ReportButton } from "./ReportButton";
import { LogButton } from "./LogButton";
import { formatFileSize } from "../lib/fileTree";

interface InfoPanelProps {
  asset: AssetInfo | null;
  validation: ValidationResult | null;
  viewerRef: React.RefObject<Viewer3DHandle | null>;
  assetPath: string | null;
}

const StatRow = memo(function StatRow({ item }: { item: ValidationItem }) {
  return (
    <div className="stat-row">
      <div className="stat-values">
        <span>{item.label}</span>
        <span className={`stat-value severity-${item.severity}`}>
          {item.severity !== "good" && (
            <span aria-label={item.severity === "bad" ? "Issue" : "Warning"}>
              {item.severity === "bad" ? "! " : "△ "}
            </span>
          )}
          {item.value}
        </span>
      </div>
      {item.severity !== "good" && item.threshold && <p className="stat-hint">{item.threshold}</p>}
    </div>
  );
});

const CategoryGroup = memo(function CategoryGroup({ group }: { group: ValidationGroup }) {
  const issueCount = group.items.filter((item) => item.severity !== "good").length;
  return (
    <section className="info-group">
      <div className="info-group-heading">
        <h3>{group.label}</h3>
        {issueCount > 0 && (
          <span className="issue-count">
            {issueCount} {issueCount === 1 ? "issue" : "issues"}
          </span>
        )}
      </div>
      <div className="info-group-content">
        {group.items.map((item) => (
          <StatRow key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
});

export function InfoPanel({ asset, validation, viewerRef, assetPath }: InfoPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (!asset) return null;

  return (
    <aside
      className={`inspector ${collapsed ? "inspector-collapsed" : ""}`}
      aria-label="Asset information"
    >
      <button
        className="inspector-toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-controls="asset-details"
        title={collapsed ? "Show asset information" : "Collapse asset information"}
      >
        <span>{collapsed ? "Info" : "Asset information"}</span>
        <span aria-hidden="true">{collapsed ? "‹" : "›"}</span>
      </button>
      {!collapsed && (
        <>
          <div className="inspector-scroll" id="asset-details">
            <div className="asset-summary">
              <div className="asset-summary-meta">
                <span className="format-tag">{asset.format}</span>
                <span>{formatFileSize(asset.fileSize)}</span>
                {validation && <ValidationBadge severity={validation.overall} />}
              </div>
              <h2 title={asset.fileName}>{asset.fileName}</h2>
              <p title={asset.filePath}>{asset.filePath}</p>
            </div>
            {validation?.groups.map((group) => (
              <CategoryGroup key={group.category} group={group} />
            ))}
            {(asset.textures.length > 0 || asset.missingTextures.length > 0) && (
              <section className="info-group">
                <div className="info-group-heading">
                  <h3>Texture files</h3>
                  <span>{asset.textures.length}</span>
                </div>
                <div className="info-group-content">
                  {asset.textures.map((tex) => (
                    <div key={tex.filePath} className="texture-row">
                      <span className="texture-type">{tex.type}</span>
                      <span className="texture-name" title={tex.fileName}>
                        {tex.fileName}
                      </span>
                      {tex.resolution && (
                        <span className="texture-size">
                          {tex.resolution.width} × {tex.resolution.height}
                        </span>
                      )}
                    </div>
                  ))}
                  {asset.missingTextures.length > 0 && (
                    <p className="missing-textures">Missing: {asset.missingTextures.join(", ")}</p>
                  )}
                </div>
              </section>
            )}
          </div>
          <div className="inspector-actions">
            <p>Save beside the source model</p>
            <div>
              <ReportButton
                key={`report-${asset.filePath}`}
                asset={asset}
                validation={validation}
              />
              <ThumbnailButton
                key={`thumbnail-${asset.filePath}`}
                viewerRef={viewerRef}
                assetPath={assetPath}
              />
              <LogButton />
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
