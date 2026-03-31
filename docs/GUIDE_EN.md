# AssetBox - Usage Guide

> A practical guide on how to use each feature in real-world workflows.

---

## Table of Contents

1. [Loading Models](#1-loading-models)
2. [Using Solid View](#2-using-solid-view)
3. [Using Wireframe View](#3-using-wireframe-view)
4. [Using Normals View](#4-using-normals-view)
5. [Using Normal Map View](#5-using-normal-map-view)
6. [Using UV View](#6-using-uv-view)
7. [Using Retopo View](#7-using-retopo-view)
8. [Using the Validation Panel](#8-using-the-validation-panel)
9. [Reports & Thumbnails](#9-reports--thumbnails)
10. [Workflow Examples](#10-workflow-examples)

---

## 1. Loading Models

### When to Use
- Quickly reviewing assets received from modelers
- Previewing without opening DCC tools (Maya, Blender, 3ds Max)
- Rapidly inspecting multiple assets in sequence

### How to Use
1. Drag and drop a file onto the AssetBox window.
2. The model loads automatically and centers in the viewport.
3. Navigate with mouse: rotate (left-click drag), zoom (scroll), pan (right-click drag).

### Tips
- Press `F` to refocus the camera on the model when you lose track of it.
- Paths with Unicode characters, spaces, and special characters are fully supported.
- Dropping a new file automatically replaces the previous model.

---

## 2. Using Solid View

**Shortcut: `1`**

### When to Use
- Checking the overall appearance of a model
- Verifying that embedded textures are applied correctly
- Reviewing silhouette and form

### What to Look For
- No visible holes or tears in the mesh
- Natural-looking silhouette
- Consistent scale with other assets in the project

### Background Switching
Click the color circles in the bottom toolbar to change the background:
- **Dark background:** Best for reviewing light-colored assets
- **Light background:** Best for dark assets or silhouette checking
- **Neutral background:** General-purpose reviewing

---

## 3. Using Wireframe View

**Shortcut: `2`**

### When to Use
- Checking edge flow and topology
- Finding areas with unnecessarily dense polygons
- Verifying triangulation results
- Detecting hidden internal geometry

### What to Look For
- **Edge flow:** For character models, check that loops around joints and faces are natural
- **Unnecessary density:** Watch for areas with excessive polygon concentration
- **Internal faces:** Look for hidden, unnecessary faces that waste GPU resources
- **N-gon artifacts:** Check for abnormal patterns after triangulation

### Tips
Cross-reference with other views for deeper analysis. For example, check areas flagged as over-dense in Retopo view to see their actual topology structure in Wireframe view.

---

## 4. Using Normals View

**Shortcut: `3`**

### When to Use
- Some faces appear black after importing into an engine
- Investigating abnormal lighting behavior
- Outline shaders not working correctly
- Final normal quality check before delivery

### How to Read
- **Blue points (small):** Correct normals. Faces point outward as expected.
- **Red points (large):** Flipped normals. Faces point inward, causing invisible or incorrectly lit surfaces.

### "Flipped Normals" Focus Button
When flipped normals are detected, a red button appears at the bottom center.
- Shows the count of flipped vertices.
- Click to automatically move the camera to the problem area.
- Invaluable for quickly locating issues in complex models.

### How to Fix
Select the affected faces in your DCC tool and flip the normals:
- **Maya:** Mesh Display > Reverse Normals
- **Blender:** Mesh > Normals > Flip
- **3ds Max:** Edit Normals > Flip

---

## 5. Using Normal Map View

**Shortcut: `4`**

### When to Use
- Visually inspecting vertex normal direction distribution
- Checking base normal state before baking normals from high-poly to low-poly
- Verifying that smoothing groups are set as intended

### How to Read
Normal directions are mapped to RGB colors:
- **Red tones:** Normals pointing strongly along the X-axis (left/right)
- **Green tones:** Normals pointing strongly along the Y-axis (up/down)
- **Blue/Purple tones:** Normals pointing along the Z-axis (toward/away from camera)

### What to Look For
- Abrupt color changes on a flat surface may indicate smoothing issues.
- Faces pointing in similar directions should have similar colors.
- Hard edges (smoothing group boundaries) should show distinct color separation — this is normal.

---

## 6. Using UV View

**Shortcut: `5`**

### When to Use
- Verifying that textures map correctly to the mesh
- Checking for UV stretching or distortion
- Evaluating UV seam placement
- Checking texel density uniformity with a checker pattern

### How to Read
A red/navy checkerboard pattern is applied to the mesh:
- **Uniform squares:** UVs are well-unwrapped with consistent texel density.
- **Stretched rectangles:** UV stretching is present. Textures will appear blurry.
- **Squished/distorted shapes:** UV distortion exists.
- **Significantly varying square sizes:** Texel density is uneven.

### What to Look For
- Areas close to the camera (high-importance areas) should have smaller checker squares (higher density).
- Key assets like character faces and weapons should have uniform checker sizes.
- UV seams should be placed in inconspicuous locations (folds, back sides, etc.).

---

## 7. Using Retopo View

**Shortcut: `6`**

### When to Use
- Evaluating scan data or auto-remesh results
- Deciding whether retopology is needed
- Finding areas that need polygon optimization
- Pre-delivery mesh quality inspection

### How to Read the Heatmap
The mesh is colored based on triangle density:

| Color | Meaning | Action |
|-------|---------|--------|
| Blue | Over-dense — unnecessarily high polygon concentration | Consider decimation or manual retopology |
| Green | Optimal density — good condition | No action needed |
| Red | Under-dense — lacking detail | Consider subdivision or adding detail manually |
| Yellow | Thin triangles — poorly shaped triangles | Causes lighting/texture artifacts. Retopology needed |

### How to Read the Diagnostic Panel
Values displayed in the top panel:

| Metric | Good | Bad |
|--------|------|-----|
| Thin triangles | < 5% | > 5% — causes texture stretching and lighting artifacts |
| Over-dense | < 10% | > 10% — wastes rendering resources |
| Under-dense | < 10% | > 10% — lacks detail |
| Density ratio | < 100x | > 1000x — extremely uneven density |

### Practical Decision Making
- **"Topology OK" (green):** The current topology is usable as-is.
- **"Retopology Recommended" (red):** Issues found — review the reason list.
  - For game assets: retopology is strongly recommended.
  - For cinematic/render purposes: may be acceptable depending on context.

---

## 8. Using the Validation Panel

### When to Use
- Quickly checking if an asset meets project standards
- QA team asset inspection
- Receiving outsourced assets

### Panel Structure
The right panel shows validation results organized into 6 categories.

### Practical Use by Category

#### Geometry
- **Tris/Verts in red:** Directly impacts engine performance. LODs needed or polygon reduction required.
- **File Size yellow or worse:** Affects loading time and memory. Consider reducing texture resolution or optimizing the mesh.
- **Degenerate Tris:** Zero-area triangles waste GPU resources. Clean up in your DCC tool.

#### Topology
- **Non-manifold in red:** Problems for 3D printing and physics simulation. Likely remnants of boolean operations.
- **Open Edges:** Mesh is not watertight. Can cause transparency issues or shadow artifacts.
- **Flipped Normals:** Verify in Normals view (`3`) using red points, then fix in your DCC tool.

#### UV
- **No UVs in red:** Textures cannot be applied. UV unwrapping is mandatory.
- **UV Channels:** Engines requiring lightmaps (Unity, Unreal) need 2 or more channels.

#### Texture
- **Missing in red:** Required textures not found. Either missing from delivery or naming convention mismatch.
- **Max Resolution yellow:** Mobile: 2048px or less recommended. PC/Console: 4096px or less recommended.

#### Material
- **No Material:** Unassigned material meshes. Will render with default shader in engine — verify if intentional.

#### Scale/Transform
- **Non-uniform Scale:** Causes lighting and physics issues. Apply Freeze Transform in your DCC tool.
- **Pivot Offset:** Position will be off when importing into engine. Reset pivot to origin.

---

## 9. Reports & Thumbnails

### Validation Report

#### When to Use
- Documenting asset inspection results
- Communicating fixes needed to modelers
- Maintaining asset quality records for a project

#### How to Use
1. Load a model, then click the "Report" button at the bottom right.
2. A `_report.html` file is created next to the model file.
3. Open in a browser to review, or share with your team.

#### Report Contents
- File information (format, filename, overall verdict)
- Validation results by category with explanations
- Texture file list and missing textures
- Retopology diagnosis results
- Print-friendly layout

### Thumbnail

#### When to Use
- Creating asset library catalog images
- Registering preview images in asset management tools (Perforce, ShotGrid, etc.)
- Attaching asset images to documents or presentations

#### How to Use
1. Position the model at your desired view mode and angle.
2. Click the "Thumbnail" button at the bottom right.
3. A `_thumbnail.png` file is created next to the model file.

#### Tips
- The grid is automatically excluded from captures.
- Switch to a light background for cleaner document-ready images.
- Captures work in any view mode (Wireframe, UV, etc.).

---

## 10. Workflow Examples

### Asset Delivery QA

```
1. Drag and drop the asset file
2. Check overall verdict in right panel (Good/Warning/Bad)
3. Review red/yellow items in detail:
   - Geometry → polygon/file size within limits
   - Topology → Non-manifold, Flipped Normals check
4. Normals view (3) → check flipped normals → use focus button to locate
5. UV view (5) → check texel density uniformity
6. Retopo view (6) → check mesh quality diagnosis
7. Generate Report → send to modeler with fix requests
```

### Receiving Outsourced Assets

```
1. Drag and drop the asset file
2. Solid view (1) → overall appearance check
3. Wireframe view (2) → topology quality check
4. Right panel → verify project standards:
   - Tris < project threshold
   - No missing textures
   - Uniform scale
5. If OK → save Thumbnail → register in asset library
6. If issues found → generate Report → request revisions
```

### Mid-Production Modeling Check

```
1. Export FBX/GLB from DCC tool
2. Drag and drop into AssetBox
3. Wireframe view (2) → check edge flow
4. Normals view (3) → check normal issues
5. UV view (5) → check UV unwrap quality
6. Retopo view (6) → check density distribution
7. If issues found → return to DCC tool, fix, re-export
```

### Scan Data Evaluation

```
1. Drag and drop scanned mesh
2. Retopo view (6) → check diagnostic panel
3. If "Retopology Recommended":
   - Review heatmap for blue (over-dense) / red (under-dense) areas
   - Check thin triangle percentage
4. Process with retopology tools (Instant Meshes, ZRemesher, etc.)
   then re-check in AssetBox to verify improvement
```
