import { BoneOverlay } from "./BoneOverlay";
import { collectRigBones } from "../lib/riggingInspection";
import { applyRetopoOverlay } from "../lib/retopoOverlay";
import {
  useRef,
  useEffect,
  useState,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Center } from "@react-three/drei";
import * as THREE from "three";
import { analyzeNormalConsistency } from "../lib/geometryDiagnostics";
import { loadModel, type LoadedModel } from "./ModelLoader";
import { disposeScene, retainSceneResources } from "../lib/disposeScene";
import type { RetopoDiagInfo } from "../types/asset";
import * as log from "../lib/logger";
import { ViewerToolbar, type ViewMode } from "./ViewerToolbar";
import {
  OVERLAY_BG,
  OVERLAY_BORDER,
  OVERLAY_BACKDROP,
  BG_COLORS,
  GRID_COLORS,
  type BgMode,
} from "../lib/overlayStyle";

import type { IssueSelection } from "../lib/issueInspection";
import { IssueHighlight } from "./IssueHighlight";
import { PreviewLighting } from "./PreviewLighting";
import { focusIssueBounds } from "../lib/focusIssueBounds";

// ── Normals visualization ──

interface FlippedNormalInfo {
  center: THREE.Vector3;
  count: number;
}

function NormalsHelper({
  model,
  onFlippedInfo,
}: {
  model: THREE.Group;
  onFlippedInfo?: (info: FlippedNormalInfo | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;

    // Clear previous
    while (group.children.length) group.remove(group.children[0]);

    // Single traversal: replace materials + compute normals
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const darkMat = new THREE.MeshBasicMaterial({
      color: 0x1a1a2e,
      transparent: true,
      opacity: 0.4,
    });
    const allNormalVerts: number[] = [];
    const allFlippedVerts: number[] = [];
    model.updateMatrixWorld(true);
    const modelWorldInverse = model.matrixWorld.clone().invert();

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      // Replace material
      originals.set(child, child.material);
      child.material = darkMat;

      const geo = child.geometry;
      const pos = geo.attributes.position;
      const norm = geo.attributes.normal;
      if (!pos || !norm) return;

      const flippedVertSet = analyzeNormalConsistency(geo).vertices;

      // Convert each mesh into model-local space so nested part transforms stay aligned.
      const localMatrix = modelWorldInverse.clone().multiply(child.matrixWorld);
      const p = new THREE.Vector3();

      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(localMatrix);
        if (flippedVertSet.has(i)) {
          allFlippedVerts.push(p.x, p.y, p.z);
        } else {
          allNormalVerts.push(p.x, p.y, p.z);
        }
      }
    });

    // Normal vertices — small blue points
    if (allNormalVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(allNormalVerts, 3));
      const mat = new THREE.PointsMaterial({ color: 0x0066ff, size: 2, sizeAttenuation: false });
      group.add(new THREE.Points(geo, mat));
    }

    // Flipped vertices — large red points
    if (allFlippedVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(allFlippedVerts, 3));
      const mat = new THREE.PointsMaterial({ color: 0xff0000, size: 6, sizeAttenuation: false });
      group.add(new THREE.Points(geo, mat));

      // Compute center of flipped vertices
      const center = new THREE.Vector3();
      const flippedCount = allFlippedVerts.length / 3;
      for (let i = 0; i < allFlippedVerts.length; i += 3) {
        center.x += allFlippedVerts[i];
        center.y += allFlippedVerts[i + 1];
        center.z += allFlippedVerts[i + 2];
      }
      center.divideScalar(flippedCount);
      onFlippedInfo?.({
        center: group.localToWorld(center.clone()),
        count: flippedCount,
      });
    } else {
      onFlippedInfo?.(null);
    }

    return () => {
      // Restore original materials
      originals.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      darkMat.dispose();
      while (group.children.length) {
        const child = group.children[0];
        if (child instanceof THREE.Points) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
        group.remove(child);
      }
      onFlippedInfo?.(null);
    };
  }, [model, onFlippedInfo]);

  return <group ref={groupRef} />;
}

// ── Normal map visualization (RGB = normal direction) ──

const normalMapVertexShader = `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const normalMapFragmentShader = `
  varying vec3 vNormalView;
  void main() {
    vec3 n = normalize(vNormalView);
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`;

function NormalMapMode({ model }: { model: THREE.Group }) {
  useEffect(() => {
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const shaderMat = new THREE.ShaderMaterial({
      vertexShader: normalMapVertexShader,
      fragmentShader: normalMapFragmentShader,
    });

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      originals.set(child, child.material);
      child.material = shaderMat;
    });

    return () => {
      originals.forEach((mat, mesh) => {
        mesh.material = mat;
      });
      shaderMat.dispose();
    };
  }, [model]);

  return null;
}

// ── Retopology diagnosis (density heatmap) ──

function RetopoDiagnostics({ model }: { model: THREE.Group }) {
  useEffect(() => {
    return applyRetopoOverlay(model);
  }, [model]);

  return null;
}

// ── UV layout visualization ──

function UVOverlay({ model }: { model: THREE.Group }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    while (group.children.length) group.remove(group.children[0]);

    // Apply UV checker material to all meshes
    const checkerCanvas = document.createElement("canvas");
    checkerCanvas.width = 512;
    checkerCanvas.height = 512;
    const ctx = checkerCanvas.getContext("2d")!;
    const gridSize = 32;
    for (let y = 0; y < 512; y += gridSize) {
      for (let x = 0; x < 512; x += gridSize) {
        const isEven = (x / gridSize + y / gridSize) % 2 === 0;
        ctx.fillStyle = isEven ? "#e94560" : "#1a1a2e";
        ctx.fillRect(x, y, gridSize, gridSize);
      }
    }
    // Draw UV grid lines
    ctx.strokeStyle = "#ffffff40";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    const checkerTexture = new THREE.CanvasTexture(checkerCanvas);
    checkerTexture.wrapS = THREE.RepeatWrapping;
    checkerTexture.wrapT = THREE.RepeatWrapping;

    // Store original materials and apply checker
    const originals: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        originals.set(child, child.material);
        child.material = new THREE.MeshBasicMaterial({ map: checkerTexture });
      }
    });

    // Cleanup: restore originals
    return () => {
      originals.forEach((mat, mesh) => {
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.dispose();
        }
        mesh.material = mat;
      });
      checkerTexture.dispose();
      while (group.children.length) group.remove(group.children[0]);
    };
  }, [model]);

  return <group ref={groupRef} />;
}

// ── Wireframe mode — replace materials with flat dark + wireframe lines ──

function WireframeMode({ model }: { model: THREE.Group }) {
  useEffect(() => {
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const wireObjects: THREE.Object3D[] = [];

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      // Store original material
      originals.set(child, child.material);

      // Replace with dark flat material
      child.material = new THREE.MeshBasicMaterial({
        color: 0x1a1a2e,
        transparent: true,
        opacity: 0.3,
      });

      // Keep the overlay in local space so parent transforms stay aligned.
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.8,
        wireframe: true,
        depthWrite: false,
      });

      let wireframe: THREE.Object3D;
      if (child instanceof THREE.SkinnedMesh) {
        const skinnedWireframe = new THREE.SkinnedMesh(child.geometry, wireMat);
        skinnedWireframe.bind(child.skeleton, child.bindMatrix);
        skinnedWireframe.bindMode = child.bindMode;
        skinnedWireframe.name = `${child.name}_wireframe`;
        wireframe = skinnedWireframe;
      } else {
        wireframe = new THREE.Mesh(child.geometry, wireMat);
      }

      wireframe.position.copy(child.position);
      wireframe.quaternion.copy(child.quaternion);
      wireframe.scale.copy(child.scale);
      wireframe.renderOrder = child.renderOrder + 1;
      child.parent?.add(wireframe);
      wireObjects.push(wireframe);
    });

    return () => {
      // Restore original materials
      originals.forEach((mat, mesh) => {
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.dispose();
        }
        mesh.material = mat;
      });
      // Remove wireframe lines
      for (const wire of wireObjects) {
        wire.parent?.remove(wire);
        if ("material" in wire) {
          (wire.material as THREE.Material).dispose();
        }
      }
    };
  }, [model]);

  return null;
}

// ── Camera focus helper (moves camera to a target point) ──

function CameraFocus({ target }: { target: THREE.Vector3 }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    const distance = 1.5;
    camera.position.set(
      target.x + distance * 0.5,
      target.y + distance * 0.4,
      target.z + distance * 0.8
    );
    camera.lookAt(target);

    if (controls) {
      const orbitControls = controls as THREE.EventDispatcher & {
        target: THREE.Vector3;
        update: () => void;
      };
      orbitControls.target.copy(target);
      orbitControls.update();
    }
  }, [target, camera, controls]);

  return null;
}

// ── Model display ──

interface ModelDisplayProps {
  bonesVisible: boolean;
  model: THREE.Group;
  viewMode: ViewMode;
  onFlippedInfo?: (info: FlippedNormalInfo | null) => void;
  focusTarget?: THREE.Vector3 | null;
  focusModelRef?: React.MutableRefObject<(() => void) | null>;
}

function ModelDisplay({
  model,
  viewMode,
  onFlippedInfo,
  focusTarget,
  focusModelRef,
  bonesVisible,
}: ModelDisplayProps) {
  const { camera, controls, invalidate } = useThree();

  const focusOnModel = useCallback(() => {
    // Center updates an ancestor transform. Flush that transform before measuring
    // the model so the first camera placement uses the displayed coordinates.
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    if (bonesVisible || box.isEmpty()) {
      const position = new THREE.Vector3();
      for (const bone of collectRigBones(model)) box.expandByPoint(bone.getWorldPosition(position));
    }
    focusIssueBounds(
      camera as THREE.PerspectiveCamera,
      controls as Parameters<typeof focusIssueBounds>[1],
      box,
      box
    );
    if (controls) {
      const size = box.getSize(new THREE.Vector3());
      (controls as THREE.EventDispatcher & { zoomSpeed: number }).zoomSpeed = Math.max(
        1.5,
        Math.min(5, Math.max(size.x, size.y, size.z) * 0.3)
      );
    }
    invalidate();
  }, [model, camera, controls, invalidate, bonesVisible]);

  useLayoutEffect(() => {
    focusOnModel();
  }, [focusOnModel]);

  useEffect(() => {
    if (focusModelRef) {
      focusModelRef.current = focusOnModel;
    }
  }, [focusModelRef, focusOnModel]);

  return (
    <group>
      <Center cacheKey={model}>
        <primitive object={model} />
        {viewMode === "wireframe" && <WireframeMode model={model} />}
        {viewMode === "normals" && <NormalsHelper model={model} onFlippedInfo={onFlippedInfo} />}
        {viewMode === "normalmap" && <NormalMapMode model={model} />}
        {viewMode === "uv" && <UVOverlay model={model} />}
        {viewMode === "retopo" && <RetopoDiagnostics model={model} />}
      </Center>
      {focusTarget && <CameraFocus target={focusTarget} />}
    </group>
  );
}

// ── Scene grid ──

function SceneGrid({
  gridRef,
  bgMode,
}: {
  gridRef: React.MutableRefObject<THREE.Object3D | null>;
  bgMode: BgMode;
}) {
  return (
    <group ref={gridRef}>
      <Grid
        infiniteGrid
        fadeDistance={30}
        fadeStrength={3}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor={GRID_COLORS[bgMode].cell}
        sectionSize={2}
        sectionThickness={1}
        sectionColor={GRID_COLORS[bgMode].section}
      />
    </group>
  );
}

// ── Screenshot helper ──

function ScreenshotHelper({
  screenshotRef,
  gridRef,
}: {
  screenshotRef: React.MutableRefObject<(() => string | null) | null>;
  gridRef: React.MutableRefObject<THREE.Object3D | null>;
}) {
  const { gl, scene, camera } = useThree();

  screenshotRef.current = () => {
    const grid = gridRef.current;
    const wasVisible = grid?.visible ?? false;
    try {
      if (grid) grid.visible = false;
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    } finally {
      if (grid) grid.visible = wasVisible;
      gl.render(scene, camera);
    }
  };

  return null;
}

// ── Keyboard handler ──

function KeyboardHandler({
  onViewMode,
  onFocusModel,
}: {
  onViewMode: (mode: ViewMode) => void;
  onFocusModel: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable || e.target.matches("button, select")))
      )
        return;
      switch (e.key) {
        case "1":
          onViewMode("default");
          break;
        case "2":
          onViewMode("wireframe");
          break;
        case "3":
          onViewMode("normals");
          break;
        case "4":
          onViewMode("normalmap");
          break;
        case "5":
          onViewMode("uv");
          break;
        case "6":
          onViewMode("retopo");
          break;
        case "f":
        case "F":
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            onFocusModel();
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onViewMode, onFocusModel]);

  return null;
}

// ── Main component ──

export interface Viewer3DHandle {
  captureScreenshot: () => string | null;
}

interface Viewer3DProps {
  filePath: string | null;
  loadRevision?: number;
  bonesVisible?: boolean;
  onModelLoaded?: (model: LoadedModel) => void;
  onError?: (error: Error) => void;
  issueSelection?: IssueSelection | null;
  onClearIssue?: () => void;
}

export const Viewer3D = forwardRef<Viewer3DHandle, Viewer3DProps>(function Viewer3D(
  {
    filePath,
    loadRevision = 0,
    onModelLoaded,
    onError,
    issueSelection,
    onClearIssue,
    bonesVisible = false,
  },
  ref
) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading model...");
  const [viewMode, setViewMode] = useState<ViewMode>("default");
  const [activeViewMode, setActiveViewMode] = useState<ViewMode>("default");
  const [bgMode, setBgMode] = useState<BgMode>("dark");
  const [showGrid, setShowGrid] = useState(false);
  const [flippedInfo, setFlippedInfo] = useState<FlippedNormalInfo | null>(null);
  const [retopoInfo, setRetopoInfo] = useState<RetopoDiagInfo | null>(null);
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null);
  const selectedIssue = issueSelection?.source.model === model ? issueSelection : null;
  const displayViewMode = selectedIssue ? "default" : activeViewMode;
  const gridRef = useRef<THREE.Object3D | null>(null);
  const screenshotRef = useRef<(() => string | null) | null>(null);
  const focusModelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!selectedIssue) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClearIssue?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIssue, onClearIssue]);

  const handleFocusModel = useCallback(() => {
    focusModelRef.current?.();
  }, []);

  useImperativeHandle(ref, () => ({
    captureScreenshot() {
      return screenshotRef.current?.() ?? null;
    },
  }));

  useEffect(() => {
    if (!model) return;
    return () => disposeScene(model);
  }, [model]);

  // Deferred view mode switch — show spinner, wait for paint, then switch
  const handleViewMode = useCallback(
    (mode: ViewMode) => {
      onClearIssue?.();
      if (mode === activeViewMode) return;
      setViewMode(mode);

      if (mode === "default") {
        // Switching back to default is fast, no spinner needed
        setActiveViewMode(mode);
        return;
      }

      const MODE_LABELS: Record<ViewMode, string> = {
        default: "Loading...",
        wireframe: "Building wireframe...",
        normals: "Computing normals...",
        normalmap: "Rendering normal map...",
        uv: "Applying UV checker...",
        retopo: "Analyzing topology...",
      };

      setLoadingMessage(MODE_LABELS[mode]);
      setLoading(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActiveViewMode(mode);
          setLoading(false);
        });
      });
    },
    [activeViewMode, onClearIssue]
  );

  useEffect(() => {
    if (!filePath) {
      setModel(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadingMessage("Loading model...");
    // The view mode is deliberately kept across files: reviewing a folder in
    // Wire or UV mode should not reset to Solid on every selection.
    setFlippedInfo(null);
    setRetopoInfo(null);
    setFocusTarget(null);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        loadModel(filePath)
          .then((loaded) => {
            if (cancelled) {
              // A newer selection won the race — release this model instead of
              // leaking its geometries and textures.
              disposeScene(loaded.scene);
              return;
            }
            retainSceneResources(loaded.scene);
            setModel(loaded.scene);
            setRetopoInfo(loaded.retopoDiag);
            onModelLoaded?.(loaded);
          })
          .catch((err) => {
            if (cancelled) return;
            setModel(null);
            log.error("Failed to load model:", err);
            onError?.(err instanceof Error ? err : new Error(String(err)));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, loadRevision, onModelLoaded, onError]);

  return (
    <div className="viewer-scene" style={{ backgroundColor: BG_COLORS[bgMode] }}>
      {selectedIssue && (
        <div className="issue-preview-bar" role="status">
          <span>
            <strong>{selectedIssue.item.label}</strong>
            <br />
            {selectedIssue.targets.length
              ? "Amber marks show the selected region through surfaces."
              : "Resource details are shown in the inspector."}
          </span>
          <button className="ui-button" onClick={onClearIssue}>
            Clear focus
          </button>
        </div>
      )}
      <div className="canvas-stage">
        {loading && (
          <div role="status" className="loading-overlay">
            <div
              className="flex flex-col items-center gap-5 px-16 py-12 rounded-2xl"
              style={{
                backgroundColor: OVERLAY_BG,
                backdropFilter: OVERLAY_BACKDROP,
                border: OVERLAY_BORDER,
              }}
            >
              <svg
                className="w-10 h-10 animate-spin"
                style={{ color: "var(--accent)" }}
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-20"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-80"
                  d="M12 2a10 10 0 019.95 9"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-sm font-medium leading-relaxed" style={{ color: "#eaeaea" }}>
                {loadingMessage}
              </span>
            </div>
          </div>
        )}

        <Canvas
          camera={{ position: [3, 3, 3], fov: 50 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
          <directionalLight position={[-3, 2, -3]} intensity={0.3} />

          <PreviewLighting />
          {model && (
            <ModelDisplay
              model={model}
              bonesVisible={bonesVisible && !selectedIssue}
              viewMode={displayViewMode}
              onFlippedInfo={setFlippedInfo}
              focusTarget={selectedIssue ? null : focusTarget}
              focusModelRef={focusModelRef}
            />
          )}
          {model && bonesVisible && !selectedIssue && <BoneOverlay model={model} />}
          {selectedIssue && <IssueHighlight selection={selectedIssue} />}

          {showGrid && !selectedIssue && <SceneGrid gridRef={gridRef} bgMode={bgMode} />}
          <ScreenshotHelper screenshotRef={screenshotRef} gridRef={gridRef} />

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        </Canvas>

        {displayViewMode === "normals" && flippedInfo && (
          <button
            onClick={() => setFocusTarget(flippedInfo.center.clone())}
            style={{
              position: "absolute",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "rgba(255, 0, 0, 0.85)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            Normal mismatches ({flippedInfo.count} vertices)
          </button>
        )}

        {displayViewMode === "retopo" && retopoInfo && (
          <div
            className="topology-panel"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              backgroundColor: OVERLAY_BG,
              border: OVERLAY_BORDER,
              backdropFilter: OVERLAY_BACKDROP,
              borderRadius: 12,
              padding: "16px",
              zIndex: 50,
              width: "min(360px, calc(100% - 24px))",
              maxHeight: "calc(100% - 24px)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: retopoInfo.needsRetopo ? "#f87171" : "#4ade80",
                }}
              />
              <span style={{ color: "#eaeaea", fontSize: 14, fontWeight: 700 }}>
                {retopoInfo.needsRetopo ? "Review triangle distribution" : "No density flags"}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px 20px",
                fontSize: 12,
              }}
            >
              <span style={{ color: "#a0a0b0" }}>Triangles</span>
              <span style={{ color: "#eaeaea", fontFamily: "monospace", textAlign: "right" }}>
                {retopoInfo.totalTris.toLocaleString()}
              </span>

              <span style={{ color: "#a0a0b0" }}>Thin triangles</span>
              <span
                style={{
                  color: retopoInfo.thinTriPercent > 5 ? "#f87171" : "#4ade80",
                  fontFamily: "monospace",
                  textAlign: "right",
                }}
              >
                {retopoInfo.thinTriPercent.toFixed(1)}%
              </span>

              <span style={{ color: "#a0a0b0" }}>Over-dense</span>
              <span
                style={{
                  color: retopoInfo.overDensePercent > 10 ? "#f87171" : "#4ade80",
                  fontFamily: "monospace",
                  textAlign: "right",
                }}
              >
                {retopoInfo.overDensePercent.toFixed(1)}%
              </span>

              <span style={{ color: "#a0a0b0" }}>Under-dense</span>
              <span
                style={{
                  color: retopoInfo.underDensePercent > 10 ? "#f87171" : "#4ade80",
                  fontFamily: "monospace",
                  textAlign: "right",
                }}
              >
                {retopoInfo.underDensePercent.toFixed(1)}%
              </span>

              <span style={{ color: "#a0a0b0" }}>Density ratio</span>
              <span
                style={{
                  color:
                    retopoInfo.densityRatio > 1000
                      ? "#f87171"
                      : retopoInfo.densityRatio > 100
                        ? "#fbbf24"
                        : "#4ade80",
                  fontFamily: "monospace",
                  textAlign: "right",
                }}
              >
                {retopoInfo.densityRatio === Infinity ? "∞" : retopoInfo.densityRatio.toFixed(0)}x
              </span>
            </div>

            {retopoInfo.reasons.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(60,60,100,0.5)",
                }}
              >
                <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 600 }}>Issues:</span>
                <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "#a0a0b0", fontSize: 12 }}>
                  {retopoInfo.reasons.map((r) => (
                    <li key={r} style={{ marginBottom: 2 }}>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid rgba(60,60,100,0.5)",
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: "#0066ff",
                    display: "inline-block",
                  }}
                />
                Over-dense
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: "#4ade80",
                    display: "inline-block",
                  }}
                />
                Good
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: "#f87171",
                    display: "inline-block",
                  }}
                />
                Under-dense
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: "#fbbf24",
                    display: "inline-block",
                  }}
                />
                Thin
              </span>
            </div>
          </div>
        )}
      </div>
      <ViewerToolbar
        viewMode={selectedIssue ? "default" : viewMode}
        bgMode={bgMode}
        onViewModeChange={handleViewMode}
        onBgModeChange={setBgMode}
        hasModel={!!model}
        onFocusModel={handleFocusModel}
        gridVisible={showGrid && !selectedIssue}
        gridDisabled={!!selectedIssue}
        onGridChange={setShowGrid}
      />

      <KeyboardHandler onViewMode={handleViewMode} onFocusModel={handleFocusModel} />
    </div>
  );
});
