import { useEffect, useRef } from "react";
import type { IssueSelection } from "../lib/issueInspection";

export function IssueDetails({
  selection,
  onSelectTarget,
  onClear,
}: {
  selection: IssueSelection;
  onSelectTarget: (index: number) => void;
  onClear: () => void;
}) {
  const { targets, targetIndex, item } = selection;
  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const details = detailsRef.current;
    const scroll = details?.closest(".inspector-scroll");
    if (details && scroll)
      scroll.scrollTop +=
        details.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8;
  }, [item]);
  const target = targets[targetIndex];
  return (
    <div
      ref={detailsRef}
      className="issue-details"
      role="region"
      aria-label={`${item.label} details`}
    >
      <h4>{item.label}</h4>
      {target ? (
        <>
          <div className="issue-target-navigation">
            <button
              className="icon-button"
              aria-label="Previous affected object"
              disabled={targetIndex === 0}
              onClick={() => onSelectTarget(targetIndex - 1)}
            >
              ‹
            </button>
            <span aria-live="polite">
              {targetIndex + 1} / {targets.length} affected
            </span>
            <button
              className="icon-button"
              aria-label="Next affected object"
              disabled={targetIndex === targets.length - 1}
              onClick={() => onSelectTarget(targetIndex + 1)}
            >
              ›
            </button>
          </div>
          <label className="issue-target-label">
            Affected object
            <select
              value={targetIndex}
              onChange={(event) => onSelectTarget(Number(event.target.value))}
            >
              {targets.map((entry, index) => (
                <option key={entry.id} value={index}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <p className="issue-target-name">{target.name}</p>
          <p>
            {target.count.toLocaleString()} {target.unit}
            {target.primitive === "bounds" ? " highlighted" : " marked"}
          </p>
          {target.details.length > 0 && (
            <ul>
              {target.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          )}
          {target.truncated && (
            <p className="issue-limit">
              Overlay limited to 20,000 primitives across affected objects. Counts and focus bounds
              include all findings; unmarked objects use a bounding box.
            </p>
          )}
          {target.bounds.isEmpty() && (
            <p>No finite geometry bounds are available for camera focus.</p>
          )}
        </>
      ) : item.inspection === "failed-resources" ? (
        <>
          <p>Failed resource paths</p>
          <ul>
            {selection.source.failedResources.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
          <p>
            The loader does not identify the owning mesh or material for these failures. Check these
            references in the source editor, then reload the model.
          </p>
        </>
      ) : (
        <p>No matching region is available in this loaded model.</p>
      )}
      <button className="ui-button" onClick={onClear}>
        Close details
      </button>
    </div>
  );
}
