# AssetBox - Feature Documentation

> 3D Asset Viewer & Validation Desktop Application
> Version: 0.1.2 | License: Apache-2.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Supported File Formats](#2-supported-file-formats)
3. [Drag and Drop](#3-drag-and-drop)
4. [View Modes](#4-view-modes)
5. [Keyboard Shortcuts](#5-keyboard-shortcuts)
6. [Validation System](#6-validation-system)
7. [Automatic Texture Detection](#7-automatic-texture-detection)
8. [Export Features](#8-export-features)
9. [UI Layout](#9-ui-layout)
10. [Backend Commands](#10-backend-commands-tauri)
11. [Tech Stack](#11-tech-stack)
12. [Build and Scripts](#12-build-and-scripts)

---

## 1. Overview

AssetBox is a desktop application for quickly previewing and validating 3D asset quality in game and real-time 3D content production pipelines.

- **Framework:** Tauri 2 (Rust backend + React frontend)
- **3D Rendering:** Three.js + React Three Fiber
- **Platforms:** Windows, macOS, Linux
- **Default Window Size:** 1280 x 800px (minimum 900 x 600px)

---

## 2. Supported File Formats

### 3D Model Input

| Format | Extension | Loader |
|--------|-----------|--------|
| FBX | `.fbx` | FBXLoader |
| glTF/GLB | `.glb`, `.gltf` | GLTFLoader |
| OBJ | `.obj` | OBJLoader |

### Textures (Auto-detected)

| Format | Extension |
|--------|-----------|
| PNG | `.png` |
| JPEG | `.jpg`, `.jpeg` |
| TGA | `.tga` |
| TIFF | `.tiff`, `.tif` |
| BMP | `.bmp` |
| EXR | `.exr` |

### Output

| Type | Filename Pattern | Description |
|------|------------------|-------------|
| Thumbnail | `{modelname}_thumbnail.png` | Viewport screenshot |
| Validation Report | `{modelname}_report.html` | Detailed HTML validation report |

---

## 3. Drag and Drop

Two drag-and-drop systems operate simultaneously:

### Tauri Native Drop
- Uses `appWindow.onDragDropEvent()` API
- Handles native OS file drop events
- Filters by supported extensions only (fbx, glb, gltf, obj)

### HTML5 DropZone
- Standard browser `onDragOver` / `onDrop` event handling
- Visual feedback on drag (border highlight, scale animation)
- Displays "Drag & Drop 3D File" guide when no file is loaded

### File Path Handling
- Automatically converts Windows backslash paths (`C:\Users\...`) to Tauri asset protocol URLs
- Supports paths with Unicode characters, spaces, and special characters
- Encodes each path segment individually to preserve slashes

---

## 4. View Modes

### 4.1 Solid (Default)
- Standard material rendering
- Displays embedded textures if present
- Environment lighting (Studio preset)

### 4.2 Wireframe
- Displays mesh edge structure
- Replaces original materials with dark transparent fill
- Green wireframe line overlay
- Useful for inspecting topology structure

### 4.3 Normals (Normal Inspection)
- Visualizes normal direction as colored points at each vertex
- **Blue points (small):** Correct normals
- **Red points (large):** Flipped normals
- Background mesh replaced with dark transparent material for readability
- When flipped normals exist, a "Flipped Normals (count)" focus button appears at bottom center
- Clicking the button automatically moves the camera to the center of flipped normals

### 4.4 Normal Map
- Custom shader visualizes vertex normal directions as RGB colors
- X-axis to R, Y-axis to G, Z-axis to B (mapped to 0~1 range)
- Classic purple/blue normal map rendering

### 4.5 UV
- Visualizes UV unwrapping with a checker texture
- Red/navy checkerboard pattern applied
- Grid lines displayed for UV distortion detection
- Useful for identifying UV seams and stretching

### 4.6 Retopo (Retopology Diagnosis)
- Triangle density heatmap for mesh quality visualization
- **Color meaning:**
  - Blue: Over-dense areas (triangles much smaller than average)
  - Green: Optimal density
  - Red: Under-dense areas (triangles much larger than average)
  - Yellow tint: Thin/stretched triangles (bad aspect ratio)
- **Top diagnostic panel displays:**
  - Retopology necessity verdict (green/red indicator)
  - Total triangle count
  - Thin triangle percentage (bad if aspect ratio > 10)
  - Over-dense / under-dense area percentages
  - Density imbalance ratio
  - Issue reason list
  - Color legend

---

## 5. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Switch to Solid view |
| `2` | Switch to Wireframe view |
| `3` | Switch to Normals view |
| `4` | Switch to Normal Map view |
| `5` | Switch to UV view |
| `6` | Switch to Retopo view |
| `F` | Focus camera on model center |

> Modifier key combinations (`Ctrl+F` / `Cmd+F`) do not trigger the focus function.
> All shortcuts are disabled when a text input field is focused.

---

## 6. Validation System

Validation is automatically performed across 6 categories when a model is loaded.

### 6.1 Geometry

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Triangles (Tris) | < 100K | < 500K | >= 500K |
| Vertices (Verts) | < 100K | < 300K | >= 300K |
| Mesh Count | < 50 | < 100 | >= 100 |
| File Size | < 50MB | < 100MB | >= 100MB |
| Degenerate Triangles | < 1% | < 5% | >= 5% |
| Bounding Box | Info display (X x Y x Z) | | |

### 6.2 Topology

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Non-Manifold Edges | 0 | <= 50 | > 50 |
| Open Edges | 0 (watertight) | Exists | |
| Flipped Normals | None | Exists | > 10% |

### 6.3 UV

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| UV Coverage | All meshes have UVs | | Meshes without UVs |
| UV Channels | 1-2 channels | | |

### 6.4 Texture

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Texture Count | Info display | | |
| Missing Textures | 0 | 1-2 | >= 3 |
| Max Resolution | < 4096px | < 8192px | >= 8192px |

### 6.5 Material

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Material Count | Info display | | |
| Unassigned Materials | None | Exists | |

### 6.6 Scale/Transform

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Non-Uniform Scale | X=Y=Z | Mismatch | |
| Pivot Offset | < 1 unit | > 10 units | |

### Overall Verdict
- **Good** (green): All metrics pass
- **Warning** (yellow): Some items need attention
- **Bad** (red): Serious issues found
- Overall verdict follows the worst severity across all items

---

## 7. Automatic Texture Detection

### Supported Texture Types

| Type | Matching Keywords |
|------|-------------------|
| BaseColor | basecolor, diffuse, albedo, color, col, diff |
| Normal | normal, nrm, norm, nml |
| Roughness | roughness, rough, rgh |
| Metallic | metallic, metalness, metal, mtl |
| AO | ao, ambientocclusion, occlusion, occ |
| Emissive | emissive, emission, emit |
| Height | height, displacement, disp, bump |
| Opacity | opacity, alpha, transparency |

### Matching Rules
- Case-insensitive
- Matches keywords after separator (`_`, `-`, `.`) at the end of filename (before extension)
- Pattern: `[_\-.]<type>$`
- Only recognized image extensions are processed
- Missing texture detection: checks for basecolor, normal, roughness when external textures exist

---

## 8. Export Features

### Thumbnail
- Saves current viewport as a PNG screenshot
- Grid is automatically excluded from capture
- Saved as `_thumbnail.png` next to the model file
- Status feedback: idle -> saving -> done/failed

### Validation Report
- Generates a detailed HTML validation report
- Saved as `_report.html` next to the model file
- **Includes:**
  - Generation timestamp
  - File info: format, filename, overall verdict
  - Validation results grouped by category
  - Per-item explanations and thresholds
  - Texture file list
  - Color-coded severity indicators
  - Print-friendly styling

---

## 9. UI Layout

### Layout Overview

```
+----------------------------------------------+
| [FBX] filename.fbx [Good]     |  Info Panel  |
|                                | (collapsible)|
|                                |  - Geometry  |
|                                |  - Topology  |
|         3D Viewport            |  - UV        |
|      (OrbitControls)           |  - Texture   |
|                                |  - Material  |
|                                |  - Transform |
|                                |              |
| [Solid][Wire][Normals]...      | [Report][Thumb]
| [Normal Map][UV][Retopo] [ooo] |              |
+----------------------------------------------+
```

### Top Left
- File format badge (FBX, GLB, etc.)
- Filename (truncated if too long)
- Validation status badge (Good/Warning/Bad)

### Right Panel
- Collapsible detailed info panel
- Validation results grouped by category
- Color-coded per item
- Texture file list (type + filename)
- Scrollable

### Bottom Left
- View mode toggle buttons (6 modes)
- Background color picker (3 options: dark, neutral, light)
- Responsive: auto-wraps when window is narrow

### Bottom Right
- Report generation button
- Thumbnail save button

### Style Theme
- **Background:** Semi-transparent dark blue (`rgba(16, 24, 48, 0.94)`)
- **Backdrop filter:** `blur(20px)` (frosted glass effect)
- **Accent color:** `#e94560` (coral red)
- **Success:** `#4ade80` (green)
- **Warning:** `#fbbf24` (yellow)
- **Error:** `#f87171` (red)

---

## 10. Backend Commands (Tauri)

### `scan_asset_directory`
- **Input:** Model file path
- **Function:** Scans the directory containing the model file
- **Output:** Model metadata, sibling file list, discovered texture files
- Only image extensions are classified as textures

### `save_thumbnail`
- **Input:** Base64 PNG data, output path
- **Function:** Decodes base64 and saves as PNG file
- Automatically creates parent directories

### `save_text_file`
- **Input:** Text content, output path
- **Function:** Saves HTML report file
- Automatically creates parent directories

---

## 11. Tech Stack

### Frontend
| Technology | Version |
|------------|---------|
| React | 19.x |
| Three.js | 0.183.x |
| @react-three/fiber | 9.x |
| @react-three/drei | 10.x |
| TypeScript | 6.x |
| Vite | 8.x |
| Tailwind CSS | 4.x |

### Desktop
| Technology | Version |
|------------|---------|
| Tauri | 2.10.x |
| Rust | (system installed) |

### Development Tools
| Tool | Purpose |
|------|---------|
| Vitest | Unit testing |
| ESLint | Code linting |
| Prettier | Code formatting |
| Husky | Git hooks |
| lint-staged | Pre-commit lint |

---

## 12. Build and Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run Tauri development mode |
| `npm run build` | Tauri production build |
| `npm run dev:web` | Vite web dev server |
| `npm run build:web` | Vite frontend build |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier formatting |
| `npm test` | Run tests |
| `npm run test:watch` | Test watch mode |
| `npm run release:patch` | Patch version bump |
| `npm run release:minor` | Minor version bump |
| `npm run release:major` | Major version bump |

### Tauri Configuration
- **Dev port:** 1420
- **Asset protocol:** Enabled (local file access)
- **Drag and drop:** Enabled
- **CSP:** Disabled (Three.js compatibility)
