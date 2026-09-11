import { expect, it } from "vitest";
import * as THREE from "three";
import { AnimationPlayback } from "../../src/lib/animationPlayback";

function fixture() {
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = "Body";
  mesh.position.x = 2;
  model.add(mesh);
  model.animations = [
    new THREE.AnimationClip("Move", 1, [
      new THREE.NumberKeyframeTrack("Body.position[x]", [0, 1], [2, 8]),
    ]),
    new THREE.AnimationClip("Scale", 2, [
      new THREE.NumberKeyframeTrack("Body.scale[y]", [0, 2], [1, 3]),
    ]),
  ];
  return { model, mesh, player: new AnimationPlayback(model) };
}

it("loads in the original pose and plays, pauses, seeks exactly to the endpoint and replays", () => {
  const { mesh, player } = fixture();
  expect(player.getSnapshot()).toMatchObject({ clipIndex: -1, playing: false });
  expect(mesh.position.x).toBe(2);
  player.togglePlaying();
  player.update(0.1);
  expect(mesh.position.x).toBeCloseTo(2.6);
  player.togglePlaying();
  player.update(0.1);
  expect(mesh.position.x).toBeCloseTo(2.6);
  player.seek(1);
  expect(mesh.position.x).toBe(8);
  expect(player.getSnapshot()).toMatchObject({ time: 1, playing: false });
  player.togglePlaying();
  expect(mesh.position.x).toBe(2);
  player.dispose();
});

it("restores properties unique to the previous clip when switching, and the original pose on reset", () => {
  const { mesh, player } = fixture();
  player.select(0);
  player.seek(0.5);
  expect(mesh.position.x).toBe(5);
  player.select(1);
  player.seek(1);
  expect(mesh.position.x).toBe(2);
  expect(mesh.scale.y).toBe(2);
  player.reset();
  expect(mesh.scale.y).toBe(1);
  expect(player.getSnapshot()).toMatchObject({ clipIndex: -1, time: 0, playing: false });
  player.dispose();
});

it("supports speed, repeat, and holding the final frame without repeating", () => {
  const { mesh, player } = fixture();
  player.select(0);
  player.seek(0.9);
  player.setSpeed(2);
  player.togglePlaying();
  player.update(0.1);
  expect(player.getSnapshot().time).toBeCloseTo(0.1);
  expect(mesh.position.x).toBeCloseTo(2.6);
  player.seek(0.9);
  player.setLoop(false);
  player.togglePlaying();
  player.update(0.1);
  expect(player.getSnapshot()).toMatchObject({ time: 1, playing: false });
  expect(mesh.position.x).toBe(8);
  player.dispose();
});

it("ignores invalid input, caps background-tab delta and filters unplayable clips", () => {
  const { model } = fixture();
  model.animations.push(new THREE.AnimationClip("Empty", 0, []));
  const player = new AnimationPlayback(model);
  expect(player.clips).toHaveLength(2);
  player.togglePlaying();
  player.update(NaN);
  player.update(-1);
  player.seek(Infinity);
  player.setSpeed(NaN);
  player.update(60);
  expect(player.getSnapshot()).toMatchObject({ time: 0.1, speed: 1 });
  player.select(999);
  expect(player.getSnapshot().clipIndex).toBe(-1);
  player.dispose();
});

it("restores morph weights on disposal without modifying shared geometry or material", () => {
  const { model, mesh } = fixture();
  const geometry = mesh.geometry,
    material = mesh.material;
  geometry.morphAttributes.position = [geometry.attributes.position.clone()];
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences![0] = 0.2;
  model.animations = [
    new THREE.AnimationClip("Morph", 1, [
      new THREE.NumberKeyframeTrack("Body.morphTargetInfluences[0]", [0, 1], [0, 1]),
    ]),
  ];
  const player = new AnimationPlayback(model);
  player.select(0);
  player.seek(0.75);
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.75);
  player.dispose();
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.2);
  expect(mesh.geometry).toBe(geometry);
  expect(mesh.material).toBe(material);
  // React Strict Mode can set up the same instance after effect cleanup.
  player.select(0);
  player.seek(1);
  expect(mesh.morphTargetInfluences![0]).toBe(1);
  player.dispose();
});

it.each(["Root.position[x]", ".position[x]"])("refreshes skin bounds for animated %s", (track) => {
  const model = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = "Root";
  const geometry = new THREE.BoxGeometry();
  const count = geometry.attributes.position.count;
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4)
  );
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  model.add(bone, mesh);
  mesh.bind(new THREE.Skeleton([bone]));
  model.animations = [
    new THREE.AnimationClip("Move", 1, [new THREE.NumberKeyframeTrack(track, [0, 1], [0, 20])]),
  ];
  const player = new AnimationPlayback(model);
  player.select(0);
  player.seek(1);
  expect(new THREE.Box3().setFromObject(model).min.x).toBeCloseTo(19.5);
  expect(
    mesh
      .boundingSphere!.clone()
      .applyMatrix4(mesh.matrixWorld)
      .containsPoint(new THREE.Vector3(20.5, 0, 0))
  ).toBe(true);
  player.dispose();
  expect(mesh.boundingBox!.min.x).toBeCloseTo(-0.5);
});
