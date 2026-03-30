import {
  useRef,
  useEffect,
  useState,
  Suspense,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Grid, Center } from "@react-three/drei";
import * as THREE from "three";
import { loadModel, type LoadedModel } from "./ModelLoader";
import { ViewerToolbar, type ViewMode } from "./ViewerToolbar";
import { OVERLAY_BG, OVERLAY_BORDER, OVERLAY_BACKDROP, BG_COLORS, type BgMode } from "../lib/overlayStyle";

// ── Normals visualization ──

function NormalsHelper({ model }: { model: THREE.Group }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;

    // Clear previous
    while (group.children.length) group.remove(group.children[0]);

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const geo = child.geometry;
      const pos = geo.attributes.position;
      const norm = geo.attributes.normal;
      if (!pos || !norm) return;

      const vertices: number[] = [];
      const colors: number[] = [];
      const scale = 0.05;

      // Compute face normals to detect flipped ones
      const index = geo.index;
      const triCount = index ? index.count / 3 : pos.count / 3;
      const flippedVerts = new Set<number>();

      const vA = new THREE.Vector3(),
        vB = new THREE.Vector3(),
        vC = new THREE.Vector3();
      const e1 = new THREE.Vector3(),
        e2 = new THREE.Vector3();
      const faceN = new THREE.Vector3(),
        avgN = new THREE.Vector3();
      const nA = new THREE.Vector3(),
        nB = new THREE.Vector3(),
        nC = new THREE.Vector3();

      for (let i = 0; i < triCount; i++) {
        let a: number, b: number, c: number;
        if (index) {
          a = index.getX(i * 3);
          b = index.getX(i * 3 + 1);
          c = index.getX(i * 3 + 2);
        } else {
          a = i * 3;
          b = i * 3 + 1;
          c = i * 3 + 2;
        }

        vA.fromBufferAttribute(pos, a);
        vB.fromBufferAttribute(pos, b);
        vC.fromBufferAttribute(pos, c);
        e1.subVectors(vB, vA);
        e2.subVectors(vC, vA);
        faceN.crossVectors(e1, e2);
        if (faceN.lengthSq() < 1e-8) continue;

        nA.fromBufferAttribute(norm, a);
        nB.fromBufferAttribute(norm, b);
        nC.fromBufferAttribute(norm, c);
        avgN.addVectors(nA, nB).add(nC);
        if (avgN.lengthSq() < 1e-8) continue;

        if (faceN.dot(avgN) < 0) {
          flippedVerts.add(a);
          flippedVerts.add(b);
          flippedVerts.add(c);
        }
      }

      // Build normal lines
      const worldMatrix = child.matrixWorld;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
      const p = new THREE.Vector3();
      const n = new THREE.Vector3();

      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(worldMatrix);
        n.fromBufferAttribute(norm, i).applyMatrix3(normalMatrix).normalize();

        vertices.push(p.x, p.y, p.z, p.x + n.x * scale, p.y + n.y * scale, p.z + n.z * scale);

        const isFlipped = flippedVerts.has(i);
        const r = isFlipped ? 1 : 0.3;
        const g = isFlipped ? 0.2 : 0.6;
        const b = isFlipped ? 0.2 : 1;
        colors.push(r, g, b, r, g, b);
      }

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
      });
      group.add(new THREE.LineSegments(lineGeo, lineMat));
    });

    return () => {
      while (group.children.length) {
        const child = group.children[0];
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
        group.remove(child);
      }
    };
  }, [model]);

  return <group ref={groupRef} />;
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
    const wireObjects: THREE.LineSegments[] = [];

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

      // Add wireframe lines as sibling
      const wireGeo = new THREE.WireframeGeometry(child.geometry);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.8,
      });
      const wireframe = new THREE.LineSegments(wireGeo, wireMat);
      wireframe.applyMatrix4(child.matrixWorld);
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
        wire.geometry.dispose();
        (wire.material as THREE.Material).dispose();
      }
    };
  }, [model]);

  return null;
}

// ── Model display ──

interface ModelDisplayProps {
  model: THREE.Group;
  viewMode: ViewMode;
}

function ModelDisplay({ model, viewMode }: ModelDisplayProps) {
  const { camera, controls } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;

    const box = new THREE.Box3().setFromObject(groupRef.current);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;

    camera.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.4,
      center.z + distance * 0.8
    );
    camera.lookAt(center);

    const perspCamera = camera as THREE.PerspectiveCamera;
    perspCamera.near = Math.max(0.01, maxDim * 0.001);
    perspCamera.far = maxDim * 100;
    perspCamera.updateProjectionMatrix();

    if (controls) {
      const orbitControls = controls as THREE.EventDispatcher & {
        target: THREE.Vector3;
        minDistance: number;
        maxDistance: number;
        zoomSpeed: number;
        update: () => void;
      };
      orbitControls.target.copy(center);
      orbitControls.minDistance = maxDim * 0.05;
      orbitControls.maxDistance = maxDim * 20;
      orbitControls.zoomSpeed = Math.max(1.5, Math.min(5, maxDim * 0.3));
      orbitControls.update();
    }
  }, [model, camera, controls]);

  return (
    <Center>
      <group ref={groupRef}>
        <primitive object={model} />
        {viewMode === "wireframe" && <WireframeMode model={model} />}
        {viewMode === "normals" && <NormalsHelper model={model} />}
        {viewMode === "uv" && <UVOverlay model={model} />}
      </group>
    </Center>
  );
}

// ── Scene grid ──

function SceneGrid({ gridRef }: { gridRef: React.MutableRefObject<THREE.Object3D | null> }) {
  return (
    <group ref={gridRef}>
      <Grid
        infiniteGrid
        fadeDistance={30}
        fadeStrength={3}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#2a2a4a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#3a3a5a"
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
    if (gridRef.current) gridRef.current.visible = false;
    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL("image/png");
    if (gridRef.current) gridRef.current.visible = true;
    gl.render(scene, camera);
    return dataUrl;
  };

  return null;
}

// ── Keyboard handler ──

function KeyboardHandler({ onViewMode }: { onViewMode: (mode: ViewMode) => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
          onViewMode("uv");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onViewMode]);

  return null;
}

// ── Main component ──

export interface Viewer3DHandle {
  captureScreenshot: () => string | null;
}

interface Viewer3DProps {
  filePath: string | null;
  onModelLoaded?: (model: LoadedModel) => void;
  onError?: (error: Error) => void;
}

export const Viewer3D = forwardRef<Viewer3DHandle, Viewer3DProps>(function Viewer3D(
  { filePath, onModelLoaded, onError },
  ref
) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading model...");
  const [viewMode, setViewMode] = useState<ViewMode>("default");
  const [activeViewMode, setActiveViewMode] = useState<ViewMode>("default");
  const [bgMode, setBgMode] = useState<BgMode>("dark");
  const gridRef = useRef<THREE.Object3D | null>(null);
  const screenshotRef = useRef<(() => string | null) | null>(null);

  useImperativeHandle(ref, () => ({
    captureScreenshot() {
      return screenshotRef.current?.() ?? null;
    },
  }));

  // Deferred view mode switch — show spinner, wait for paint, then switch
  const handleViewMode = useCallback(
    (mode: ViewMode) => {
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
        uv: "Applying UV checker...",
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
    [activeViewMode]
  );

  useEffect(() => {
    if (!filePath) {
      setModel(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadingMessage("Loading model...");
    setViewMode("default");
    setActiveViewMode("default");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        loadModel(filePath)
          .then((loaded) => {
            if (cancelled) return;
            setModel(loaded.scene);
            onModelLoaded?.(loaded);
          })
          .catch((err) => {
            if (cancelled) return;
            console.error("Failed to load model:", err);
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
  }, [filePath, onModelLoaded, onError]);

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: BG_COLORS[bgMode] }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
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
              style={{ color: "#e94560" }}
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

        <Suspense fallback={null}>
          {model && <ModelDisplay model={model} viewMode={activeViewMode} />}
          <Environment preset="studio" background={false} />
        </Suspense>

        <SceneGrid gridRef={gridRef} />
        <ScreenshotHelper screenshotRef={screenshotRef} gridRef={gridRef} />

        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>

      <ViewerToolbar
        viewMode={viewMode}
        bgMode={bgMode}
        onViewModeChange={handleViewMode}
        onBgModeChange={setBgMode}
        hasModel={!!model}
      />

      <KeyboardHandler onViewMode={handleViewMode} />
    </div>
  );
});
