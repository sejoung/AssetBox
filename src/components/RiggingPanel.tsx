import type { BoneSelection } from "../lib/boneInfluence";
import { useMemo, useState } from "react";
import type { AssetInfo, RiggingInfo } from "../types/asset";

interface Props {
  rigging: RiggingInfo;
  format: AssetInfo["format"];
  bonesVisible: boolean;
  selection?: BoneSelection | null;
  onSelectBone?: (id: string) => void;
  onClearSelection?: () => void;
  onBonesVisibleChange?: (visible: boolean) => void;
}

function BoneHierarchy({
  bones,
  selectedId,
  onSelect,
}: {
  bones: RiggingInfo["bones"];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const children = new Map<string | null, typeof bones>();
    for (const bone of bones) {
      const siblings = children.get(bone.parentId) ?? [];
      siblings.push(bone);
      children.set(bone.parentId, siblings);
    }
    const ordered: { bone: (typeof bones)[number]; depth: number; parent: string }[] = [];
    const stack = [...(children.get(null) ?? [])]
      .reverse()
      .map((bone) => ({ bone, depth: 0, parent: "Root" }));
    while (stack.length) {
      const row = stack.pop()!;
      ordered.push(row);
      for (const child of [...(children.get(row.bone.id) ?? [])].reverse()) {
        stack.push({ bone: child, depth: row.depth + 1, parent: row.bone.name });
      }
    }
    return ordered;
  }, [bones]);
  const matches = rows.filter(({ bone }) =>
    bone.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <details className="rig-details">
      <summary>
        Bone hierarchy <span>{bones.length}</span>
      </summary>
      <input
        className="rig-search"
        aria-label="Find bone"
        placeholder="Find bone by name…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ol className="rig-bones" aria-label="Bone hierarchy">
        {matches.slice(0, 200).map(({ bone, depth, parent }) => (
          <li key={bone.id} style={{ paddingLeft: Math.min(depth, 8) * 12 }}>
            <button
              type="button"
              className="rig-bone-button"
              aria-label={`Select bone ${bone.name}`}
              aria-pressed={selectedId === bone.id}
              onClick={() => onSelect?.(bone.id)}
            >
              <span className="rig-bone-name" title={`${bone.name} · Parent: ${parent}`}>
                {bone.name}
              </span>
              <span className="rig-parent" title={parent}>
                {bone.parentId ? `↳ ${parent}` : "Root"}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {!matches.length && <p className="stat-hint">No matching bones.</p>}
      {matches.length > 200 && (
        <p className="stat-hint">
          Showing 200 of {matches.length} bones. Search to narrow the list.
        </p>
      )}
    </details>
  );
}

export function RiggingPanel({
  rigging,
  format,
  bonesVisible,
  onBonesVisibleChange,
  selection,
  onSelectBone,
  onClearSelection,
}: Props) {
  const { bones, skins, clips } = rigging;
  const status = skins.length ? "Skinned" : bones.length ? "Bones only" : "Not found";
  return (
    <section className="info-group" aria-label="Rigging information">
      <div className="info-group-heading">
        <h3>Rigging</h3>
        <span>{status}</span>
      </div>
      <div className="info-group-content">
        {!bones.length && !skins.length ? (
          <p className="stat-hint">
            {format === "obj"
              ? "OBJ does not store bones, skin weights or animation clips."
              : "No bones or skinned meshes found in this loaded model."}
          </p>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat-values">
                <span>Bones</span>
                <span className="stat-value">{bones.length}</span>
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-values">
                <span>Skins / skinned meshes</span>
                <span className="stat-value">
                  {rigging.skeletonCount} / {skins.length}
                </span>
              </div>
            </div>
            {bones.length > 0 && onBonesVisibleChange && (
              <button
                className="ui-button rig-toggle"
                aria-pressed={bonesVisible}
                onClick={() => onBonesVisibleChange(!bonesVisible)}
              >
                Show bones
              </button>
            )}
            {bonesVisible && (
              <p className="stat-hint">
                Hidden bones appear faint. Select a bone to see the surface it influences.
              </p>
            )}
            {selection && (
              <div className="rig-selection" role="region" aria-label="Bone influence">
                <strong>{selection.name}</strong>
                <button className="ui-button" onClick={onClearSelection}>
                  Clear bone selection
                </button>
                <p className="stat-hint">
                  Direct skin weights for this bone. Unweighted surfaces keep their original
                  appearance.
                </p>
                <div
                  className="rig-weight-scale"
                  role="img"
                  aria-label="Weight colors: blue for low influence, green for medium, amber for full influence"
                />
                <div className="rig-weight-labels">
                  <span>0 · Low</span>
                  <span>1 · Full</span>
                </div>
                {!selection.targets.length && (
                  <p className="stat-hint">No skin bindings reference this bone.</p>
                )}
                {selection.targets.map((target) => (
                  <div className="rig-entry" key={target.mesh.uuid}>
                    <strong>{target.name}</strong>
                    <p>
                      {target.weights
                        ? `${target.weightedVertices.toLocaleString()} / ${target.weights.length.toLocaleString()} vertices influenced`
                        : "Skin weights could not be inspected."}
                    </p>
                    {target.weights && target.weightedVertices === 0 && (
                      <p>This binding has no positive weights for the selected bone.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {bones.length > 0 && (
              <BoneHierarchy bones={bones} selectedId={selection?.boneId} onSelect={onSelectBone} />
            )}
            {skins.length > 0 && (
              <details className="rig-details">
                <summary>
                  Skin bindings <span>{skins.length}</span>
                </summary>
                <div className="rig-list">
                  {skins.map((skin) => (
                    <div className="rig-entry" key={skin.id}>
                      <strong>{skin.name}</strong>
                      <p>
                        {skin.boneCount} bones · {skin.vertexCount.toLocaleString()} vertices
                      </p>
                      <p>Max influences / vertex: {skin.maxInfluences ?? "Not checked"}</p>
                      {skin.unweightedVertices !== null && (
                        <p>
                          Vertices without valid weights: {skin.unweightedVertices.toLocaleString()}
                        </p>
                      )}
                      {skin.invalidInfluenceVertices !== null &&
                        skin.invalidInfluenceVertices > 0 && (
                          <p>
                            Vertices with invalid influences:{" "}
                            {skin.invalidInfluenceVertices.toLocaleString()}
                          </p>
                        )}
                    </div>
                  ))}
                </div>
                <p className="stat-hint">Values reflect skin data retained by the loader.</p>
              </details>
            )}
          </>
        )}
        <details className="rig-details">
          <summary>
            Animation clips <span>{clips.length}</span>
          </summary>
          {clips.length ? (
            <div className="rig-list">
              {clips.map((clip) => (
                <div className="rig-entry" key={clip.id}>
                  <strong>{clip.name}</strong>
                  <p>
                    {clip.duration === null
                      ? "Duration unknown"
                      : `${Number(clip.duration.toFixed(3))} s`}{" "}
                    · {clip.trackCount} {clip.trackCount === 1 ? "track" : "tracks"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="stat-hint">No animation clips found.</p>
          )}
          {clips.length > 0 && (
            <p className="stat-hint">
              Preview playable clips with the animation controls below the model in Solid view.
            </p>
          )}
        </details>
        {(bones.length > 0 || skins.length > 0) && (
          <p className="stat-hint">
            Exported bones and skin bindings. IK constraints and Blender control rigs are not
            inspected.
          </p>
        )}
      </div>
    </section>
  );
}
