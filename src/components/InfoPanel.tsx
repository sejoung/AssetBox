import type { BoneSelection } from "../lib/boneInfluence";
import { RiggingPanel } from "./RiggingPanel";
import { IssueDetails } from "./IssueDetails";
import type { IssueSelection } from "../lib/issueInspection";
import { VALIDATION_STATUS } from "../lib/validationStatus";
import { memo, useState } from "react";
import type { AssetInfo, ValidationResult, ValidationItem, ValidationGroup } from "../types/asset";
import { ValidationBadge } from "./ValidationBadge";
import type { Viewer3DHandle } from "./Viewer3D";
import { ThumbnailButton } from "./ThumbnailButton";
import { ReportButton } from "./ReportButton";
import { LogButton } from "./LogButton";
import { formatFileSize } from "../lib/fileTree";

interface IssueProps {
  issueSelection?: IssueSelection | null;
  onInspectIssue?: (item: ValidationItem) => void;
  onSelectIssueTarget?: (index: number) => void;
  onClearIssue?: () => void;
}

interface InfoPanelProps extends IssueProps {
  bonesVisible?: boolean;
  boneSelection?: BoneSelection | null;
  onSelectBone?: (id: string) => void;
  onClearBoneSelection?: () => void;
  onBonesVisibleChange?: (visible: boolean) => void;
  asset: AssetInfo | null;
  validation: ValidationResult | null;
  viewerRef: React.RefObject<Viewer3DHandle | null>;
  assetPath: string | null;
}

const StatRow = memo(function StatRow({
  item,
  issueSelection,
  onInspectIssue,
  onSelectIssueTarget,
  onClearIssue,
}: { item: ValidationItem } & IssueProps) {
  const selected = issueSelection?.item === item;
  const values = (
    <div className="stat-values">
      <span title={item.threshold}>{item.label}</span>
      <span className={`stat-value severity-${item.severity}`}>
        {item.severity !== "good" && (
          <span aria-label={VALIDATION_STATUS[item.severity].label}>
            {VALIDATION_STATUS[item.severity].symbol}
          </span>
        )}
        {item.value}
      </span>
    </div>
  );
  return (
    <div className={`stat-row ${selected ? "stat-row-selected" : ""}`}>
      {item.inspection && onInspectIssue ? (
        <button
          className="stat-action"
          aria-label={`Inspect ${item.label}`}
          aria-pressed={selected}
          onClick={() => onInspectIssue(item)}
        >
          {values}
          <span className="stat-action-hint">
            {item.inspection === "failed-resources" ? "Show resource details" : "Locate in model"}{" "}
            <span aria-hidden="true">↗</span>
          </span>
        </button>
      ) : (
        values
      )}
      {item.severity !== "good" && item.threshold && <p className="stat-hint">{item.threshold}</p>}
      {selected && onSelectIssueTarget && onClearIssue && (
        <IssueDetails
          selection={issueSelection}
          onSelectTarget={onSelectIssueTarget}
          onClear={onClearIssue}
        />
      )}
    </div>
  );
});

const CategoryGroup = memo(function CategoryGroup({
  group,
  ...issueProps
}: { group: ValidationGroup } & IssueProps) {
  const issueCount = group.items.filter(
    (item) => item.severity === "warning" || item.severity === "bad"
  ).length;
  const unknownCount = group.items.filter((item) => item.severity === "unknown").length;
  return (
    <section className="info-group">
      <div className="info-group-heading">
        <h3>{group.label}</h3>
        {unknownCount > 0 && <span className="unchecked-count">{unknownCount} unchecked</span>}
        {issueCount > 0 && (
          <span className="issue-count">
            {issueCount} {issueCount === 1 ? "issue" : "issues"}
          </span>
        )}
      </div>
      <div className="info-group-content">
        {group.items.map((item) => (
          <StatRow key={item.label} item={item} {...issueProps} />
        ))}
      </div>
    </section>
  );
});

export function InfoPanel({
  asset,
  validation,
  viewerRef,
  assetPath,
  bonesVisible = false,
  boneSelection,
  onSelectBone,
  onClearBoneSelection,
  onBonesVisibleChange,
  ...issueProps
}: InfoPanelProps) {
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
                <span>
                  {asset.fileSize === null ? "Size unknown" : formatFileSize(asset.fileSize)}
                </span>
                {validation && <ValidationBadge severity={validation.overall} />}
              </div>
              <h2 title={asset.fileName}>{asset.fileName}</h2>
              <p title={asset.filePath}>{asset.filePath}</p>
            </div>
            {validation && (
              <p className="validation-note">
                Review flags for your intended use.{" "}
                {validation.items.filter((item) => item.severity === "unknown").length > 0
                  ? "Some checks are incomplete; see the details below."
                  : "Budget flags are guidance, not a rejection."}
              </p>
            )}
            {asset.rigging && (
              <RiggingPanel
                key={asset.filePath}
                rigging={asset.rigging}
                format={asset.format}
                bonesVisible={bonesVisible}
                selection={boneSelection}
                onSelectBone={onSelectBone}
                onClearSelection={onClearBoneSelection}
                onBonesVisibleChange={onBonesVisibleChange}
              />
            )}
            {validation?.groups.map((group) => (
              <CategoryGroup key={group.category} group={group} {...issueProps} />
            ))}
            {(asset.textures.length > 0 || asset.missingTextures.length > 0) && (
              <section className="info-group">
                <div className="info-group-heading">
                  <h3>Nearby texture files</h3>
                  <span>{asset.textures.length}</span>
                </div>
                <div className="info-group-content">
                  <p className="stat-hint">
                    Names found beside the model; material bindings are checked separately.
                  </p>
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
                    <p className="missing-textures">
                      Failed resources: {asset.missingTextures.join(", ")}
                    </p>
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
