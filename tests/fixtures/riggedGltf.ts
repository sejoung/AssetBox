import * as THREE from "three";

/** A real two-joint skin and one animation, used by loader and browser checks. */
export function riggedGltf(): string {
  const geometry = new THREE.BoxGeometry(0.6, 1.6, 0.4);
  const position = geometry.getAttribute("position");
  const indices = new Uint16Array(position.count * 4);
  const weights = new Float32Array(position.count * 4);
  for (let vertex = 0; vertex < position.count; vertex++) {
    indices[vertex * 4] = position.getY(vertex) > 0 ? 1 : 0;
    weights[vertex * 4] = 1;
  }
  const inverses = new Float32Array([
    ...new THREE.Matrix4().makeTranslation(0, 0.5, 0).elements,
    ...new THREE.Matrix4().makeTranslation(0, -0.5, 0).elements,
  ]);
  const arrays = [
    position.array,
    geometry.getAttribute("normal").array,
    geometry.index!.array,
    indices,
    weights,
    inverses,
    new Float32Array([0, 1.5]),
    new Float32Array([0, 0, 0, 1, 0, 0, Math.sin(0.25), Math.cos(0.25)]),
  ];
  let byteLength = 0;
  const views = arrays.map((array) => {
    const view = { buffer: 0, byteOffset: byteLength, byteLength: array.byteLength };
    byteLength += array.byteLength;
    return view;
  });
  const bytes = new Uint8Array(byteLength);
  arrays.forEach((array, index) =>
    bytes.set(
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
      views[index].byteOffset
    )
  );
  geometry.dispose();
  return JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "Body", mesh: 0, skin: 0 },
      { name: "Hips", translation: [0, -0.5, 0], children: [2] },
      { name: "Spine", translation: [0, 1, 0] },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 3, WEIGHTS_0: 4 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.35, 0.4, 0.5, 1],
          metallicFactor: 0,
          roughnessFactor: 0.7,
        },
      },
    ],
    skins: [{ joints: [1, 2], skeleton: 1, inverseBindMatrices: 5 }],
    animations: [
      {
        name: "Idle",
        samplers: [{ input: 6, output: 7 }],
        channels: [{ sampler: 0, target: { node: 2, path: "rotation" } }],
      },
    ],
    buffers: [
      {
        uri: "data:application/octet-stream;base64," + btoa(String.fromCharCode(...bytes)),
        byteLength,
      },
    ],
    bufferViews: views,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: position.count,
        type: "VEC3",
        min: [-0.3, -0.8, -0.2],
        max: [0.3, 0.8, 0.2],
      },
      { bufferView: 1, componentType: 5126, count: position.count, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: arrays[2].length, type: "SCALAR" },
      { bufferView: 3, componentType: 5123, count: position.count, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: position.count, type: "VEC4" },
      { bufferView: 5, componentType: 5126, count: 2, type: "MAT4" },
      { bufferView: 6, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1.5] },
      { bufferView: 7, componentType: 5126, count: 2, type: "VEC4" },
    ],
  });
}
