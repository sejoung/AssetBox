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
| Thumbnail | `{modelname.extension}_thumbnail.png` | Viewport screenshot |
| Validation Report | `{modelname.extension}_report.html` | Detailed HTML validation report |

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
- Locally generated studio environment lighting. The first preview does not wait for an external HDR download.

### 4.2 Wireframe
- Displays mesh edge structure
- Replaces original materials with dark transparent fill
- Green wireframe line overlay
- Useful for inspecting topology structure

### 4.3 Normals

- Red points mark vertices belonging to triangles whose winding disagrees with their vertex normals.
- Blue points are not marked as mismatches; this does not prove outward orientation.
- `Normal mismatches (N vertices)` focuses the marked region.
- The inspector counts triangles, while the focus button counts vertices.

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

Loaded models are inspected across Geometry, Topology, UV, Texture, Material, and Scale / Transform. The [validation guide (Korean)](VALIDATION_GUIDE.md) documents thresholds, remediation, and measurement limits.

- **Checked:** No flags in the checks performed.
- **Review:** A reference budget or structure needs review against the intended use.
- **Needs attention:** A resource load failure, missing required UV channel, or high degenerate-face ratio was detected.
- **Incomplete:** A measurement or source reference could not be checked. This is not a pass.

Interactive and batch validation share the same pipeline. Overall priority is Needs attention → Review → Incomplete → Checked. Incomplete checks remain visible in the details and report even when another flag takes priority.

### Locate inspection findings

- The reference grid is off by default. Toggle it with `Grid` in the normal preview; finding focus temporarily hides it and restores the previous setting when cleared.

- Click `Locate in model` to focus the camera and mark affected edges, triangles, or meshes in amber.
- Navigate affected objects in the details panel and inspect their names, counts, materials, and texture bindings.
- `Show resource details` lists actual failed paths without guessing ownership.
- `Clear focus`, `Close details`, or `Escape` removes the highlight. Changing files clears the selection; no review history is saved.
- Instance bounds, loaded-pose mapping, and the 20,000-primitive overlay limit are described in the [validation guide (Korean)](VALIDATION_GUIDE.md).

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
- Filename matching discovers nearby files only. Actual resource failures are collected by the loader.

---

## 8. Export Features

### Thumbnail
- Saves current viewport as a PNG screenshot
- Grid is automatically excluded from capture
- Saved as `chair.glb_thumbnail.png` next to the model, keeping its original extension
- Status feedback: idle -> saving -> done/failed

### Validation Report
- Generates a detailed HTML validation report
- Saved as `chair.glb_report.html` next to the model, keeping its original extension
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

Shared colors, typography, spacing, responsive layout, and change guidelines are documented in the [design guide (Korean)](DESIGN_GUIDE.md).

| Area | Contents |
| --- | --- |
| App header | AssetBox, file browser toggle, Open folder |
| Left Files panel | Folder navigation, search, filters, file list, batch validation |
| Center Preview | Current filename, 3D canvas, six view modes, three backgrounds, Fit model |
| Right Asset information | File summary and verdict, rigging information, validation groups, textures, Report, Thumbnail, Logs |

The file list and inspection details scroll independently. Preview controls and export buttons stay within their respective areas. Collapsing the inspector makes more room for the model. Previous inspection details and export buttons are hidden while inspecting a newly selected file.

The default window is 1280 × 800px; the minimum is 900 × 600px. At window widths of 1100px or less, the inspector narrows and secondary shortcut badges are hidden. When the Preview container is 570px wide or less, view modes use three columns and two rows.

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

## Rigging information

Inspect FBX, GLB and glTF bone hierarchies, search names, view skin bindings and maximum influences, and list animation names, durations and track counts. `Show bones` overlays shaded octahedral bones and joint spheres on the model. Rigging information does not affect validation grades. Embedded animation clips can be previewed in Solid view with clip selection, play/pause, seeking, speed and loop controls. Bones, weight overlays and camera clipping follow the animated pose. Reset pose and diagnostic views restore the loaded pose. IK/control-rig inspection and per-frame validation are not supported.

Selecting a bone in the hierarchy or viewport shows direct skin weights and per-mesh influenced vertex counts. Occluded bones are faint, and toggling the overlay preserves the camera.
