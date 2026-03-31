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
import type { RetopoDiagInfo } from "../types/asset";
import * as log from "../lib/logger";
import { ViewerToolbar, type ViewMode } from "./ViewerToolbar";
import {
  OVERLAY_BG,
  OVERLAY_BORDER,
  OVERLAY_BACKDROP,
  BG_COLORS,
  type BgMode,
} from "../lib/overlayStyle";

// ── Scene disposal helper ──

function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (mat) {
          for (const key of Object.keys(mat) as (keyof typeof mat)[]) {
            const value = mat[key];
            if (value instanceof THREE.Texture) {
              value.dispose();
            }
          }
          mat.dispose();
        }
      }
    }
  });
}

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

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      // Replace material
      originals.set(child, child.material);
      child.material = darkMat;

      const geo = child.geometry;
      const pos = geo.attributes.position;
      const norm = geo.attributes.normal;
      if (!pos || !norm) return;

      // Compute face normals to detect flipped ones
      const index = geo.index;
      const triCount = index ? index.count / 3 : pos.count / 3;
      const flippedVertSet = new Set<number>();

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
          flippedVertSet.add(a);
          flippedVertSet.add(b);
          flippedVertSet.add(c);
        }
      }

      // Separate normal vs flipped vertex positions
      const worldMatrix = child.matrixWorld;
      const p = new THREE.Vector3();

      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(worldMatrix);
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
      onFlippedInfo?.({ center, count: flippedCount });
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
    const vA = new THREE.Vector3(),
      vB = new THREE.Vector3(),
      vC = new THREE.Vector3();
    const e1 = new THREE.Vector3(),
      e2 = new THREE.Vector3();

    // Pass 1: compute global average area (no arrays stored)
    let totalArea = 0;
    let totalTris = 0;
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const pos = child.geometry.attributes.position;
      if (!pos) return;
      const index = child.geometry.index;
      const triCount = index ? index.count / 3 : pos.count / 3;
      totalTris += triCount;
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
        totalArea += e1.cross(e2).length() * 0.5;
      }
    });

    if (totalTris === 0) return;
    const globalAvg = totalArea / totalTris;

    // Pass 2: apply vertex colors per mesh using globalAvg
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const meshes: THREE.Mesh[] = [];

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const geo = child.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;

      originals.set(child, child.material);
      meshes.push(child);

      const index = geo.index;
      const triCount = index ? index.count / 3 : pos.count / 3;
      const posCount = pos.count;
      const colorAttr = new Float32Array(posCount * 3);
      const weightCount = new Float32Array(posCount);

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
        const area = e1.cross(e2).length() * 0.5;

        // Density score
        const areaRatio = globalAvg > 1e-10 ? area / globalAvg : 1;
        const score = Math.max(-3, Math.min(3, Math.log2(Math.max(areaRatio, 1e-6))));

        // Aspect ratio for thin triangle detection
        const edgeAB = vA.distanceTo(vB);
        const edgeBC = vB.distanceTo(vC);
        const edgeCA = vC.distanceTo(vA);
        const longest = Math.max(edgeAB, edgeBC, edgeCA);
        const shortest = Math.min(edgeAB, edgeBC, edgeCA);
        const aspectPenalty = Math.min((shortest > 1e-10 ? longest / shortest : 100) / 10, 1);

        let r: number, g: number, b2: number;
        if (score < 0) {
          const t = -score / 3;
          r = 0;
          g = 1 - t * 0.7;
          b2 = t;
        } else {
          const t = score / 3;
          r = t;
          g = 1 - t * 0.7;
          b2 = 0;
        }

        if (aspectPenalty > 0.3) {
          const blend = (aspectPenalty - 0.3) / 0.7;
          r = r + (1 - r) * blend * 0.7;
          g = g + (0.8 - g) * blend * 0.5;
          b2 = b2 * (1 - blend * 0.8);
        }

        colorAttr[a * 3] += r;
        colorAttr[a * 3 + 1] += g;
        colorAttr[a * 3 + 2] += b2;
        weightCount[a]++;
        colorAttr[b * 3] += r;
        colorAttr[b * 3 + 1] += g;
        colorAttr[b * 3 + 2] += b2;
        weightCount[b]++;
        colorAttr[c * 3] += r;
        colorAttr[c * 3 + 1] += g;
        colorAttr[c * 3 + 2] += b2;
        weightCount[c]++;
      }

      for (let i = 0; i < posCount; i++) {
        const w = weightCount[i] || 1;
        colorAttr[i * 3] /= w;
        colorAttr[i * 3 + 1] /= w;
        colorAttr[i * 3 + 2] /= w;
      }

      geo.setAttribute("_retopoColor", new THREE.BufferAttribute(colorAttr, 3));
      child.material = new THREE.MeshBasicMaterial({ vertexColors: true });
      geo.attributes.color = geo.attributes._retopoColor;
    });

    return () => {
      for (const mesh of meshes) {
        const geo = mesh.geometry;
        if (geo.attributes._retopoColor) {
          geo.deleteAttribute("_retopoColor");
          delete geo.attributes.color;
        }
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.dispose();
        }
        const orig = originals.get(mesh);
        if (orig) mesh.material = orig;
      }
    };
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
}: ModelDisplayProps) {
  const { camera, controls } = useThree();
  const wrapperRef = useRef<THREE.Group>(null);

  const focusOnModel = useCallback(() => {
    if (!wrapperRef.current) return;

    // Use the wrapper ref which includes Center's transform
    const box = new THREE.Box3().setFromObject(wrapperRef.current);
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
  }, [camera, controls]);

  useEffect(() => {
    focusOnModel();
  }, [model, focusOnModel]);

  useEffect(() => {
    if (focusModelRef) {
      focusModelRef.current = focusOnModel;
    }
  }, [focusModelRef, focusOnModel]);

  return (
    <group ref={wrapperRef}>
      <Center>
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
  const [flippedInfo, setFlippedInfo] = useState<FlippedNormalInfo | null>(null);
  const [retopoInfo, setRetopoInfo] = useState<RetopoDiagInfo | null>(null);
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null);
  const gridRef = useRef<THREE.Object3D | null>(null);
  const screenshotRef = useRef<(() => string | null) | null>(null);
  const focusModelRef = useRef<(() => void) | null>(null);

  const handleFocusModel = useCallback(() => {
    focusModelRef.current?.();
  }, []);

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
    [activeViewMode]
  );

  useEffect(() => {
    if (!filePath) {
      setModel((prev) => {
        if (prev) disposeScene(prev);
        return null;
      });
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadingMessage("Loading model...");
    setViewMode("default");
    setActiveViewMode("default");
    setFlippedInfo(null);
    setRetopoInfo(null);
    setFocusTarget(null);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        loadModel(filePath)
          .then((loaded) => {
            if (cancelled) return;
            setModel((prev) => {
              if (prev) disposeScene(prev);
              return loaded.scene;
            });
            setRetopoInfo(loaded.retopoDiag);
            onModelLoaded?.(loaded);
          })
          .catch((err) => {
            if (cancelled) return;
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
          {model && (
            <ModelDisplay
              model={model}
              viewMode={activeViewMode}
              onFlippedInfo={setFlippedInfo}
              focusTarget={focusTarget}
              focusModelRef={focusModelRef}
            />
          )}
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

      {activeViewMode === "normals" && flippedInfo && (
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
          Flipped Normals ({flippedInfo.count})
        </button>
      )}

      {activeViewMode === "retopo" && retopoInfo && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            backgroundColor: OVERLAY_BG,
            border: OVERLAY_BORDER,
            backdropFilter: OVERLAY_BACKDROP,
            borderRadius: 12,
            padding: "16px 24px",
            zIndex: 50,
            minWidth: 320,
            maxWidth: 420,
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
              {retopoInfo.needsRetopo ? "Retopology Recommended" : "Topology OK"}
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
              style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(60,60,100,0.5)" }}
            >
              <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 600 }}>Issues:</span>
              <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "#a0a0b0", fontSize: 11 }}>
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
              gap: 16,
              fontSize: 10,
              color: "#707080",
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

      <KeyboardHandler onViewMode={handleViewMode} onFocusModel={handleFocusModel} />
    </div>
  );
});
