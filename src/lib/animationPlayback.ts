import * as THREE from "three";

export interface PlaybackState {
  clipIndex: number;
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  loop: boolean;
}

/** One model owns one mixer. Paused actions allow exact, reversible timeline seeks. */
export class AnimationPlayback {
  readonly clips: THREE.AnimationClip[];
  private mixer: THREE.AnimationMixer;
  private action: THREE.AnimationAction | null = null;
  private state: PlaybackState = {
    clipIndex: -1,
    time: 0,
    duration: 0,
    playing: false,
    speed: 1,
    loop: true,
  };
  private snapshot = this.state;
  private listeners = new Set<() => void>();
  private elapsed = 0;

  constructor(readonly model: THREE.Group) {
    this.clips = model.animations.filter(
      (clip) => Number.isFinite(clip.duration) && clip.duration > 0 && clip.tracks.length > 0
    );
    this.mixer = new THREE.AnimationMixer(model);
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish() {
    this.elapsed = 0;
    this.snapshot = { ...this.state };
    this.listeners.forEach((listener) => listener());
  }

  private updatePose() {
    if (this.action) {
      this.action.time = this.state.time;
      this.mixer.update(0);
    }
    this.model.updateWorldMatrix(true, false);
    // Invoke SkinnedMesh.updateMatrixWorld too: attached skins must refresh
    // bindMatrixInverse when a clip moves the whole model or a mesh ancestor.
    this.model.updateMatrixWorld(true);
    this.model.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      object.skeleton.update();
      // Three caches skin bounds. Refresh them after deformation so the renderer
      // and camera don't cull a moving limb using the original pose.
      object.computeBoundingBox();
      object.boundingSphere ??= new THREE.Sphere();
      object.boundingBox!.getBoundingSphere(object.boundingSphere);
    });
  }

  select(index: number) {
    if (!Number.isInteger(index) || !this.clips[index]) {
      this.reset();
      return;
    }
    this.mixer.stopAllAction();
    this.action = this.mixer.clipAction(this.clips[index]);
    this.action.reset().setLoop(THREE.LoopOnce, 1).play();
    this.action.paused = true;
    this.state = { ...this.state, clipIndex: index, time: 0, duration: this.clips[index].duration };
    this.updatePose();
    this.publish();
  }

  togglePlaying() {
    if (!this.clips.length) return;
    if (!this.action) this.select(0);
    if (!this.state.playing && this.state.time >= this.state.duration) {
      this.state.time = 0;
      this.updatePose();
    }
    this.state.playing = !this.state.playing;
    this.publish();
  }

  seek(time: number) {
    if (!this.action || !Number.isFinite(time)) return;
    this.state.time = THREE.MathUtils.clamp(time, 0, this.state.duration);
    this.state.playing = false;
    this.updatePose();
    this.publish();
  }

  setSpeed(speed: number) {
    if (![0.25, 0.5, 1, 1.5, 2].includes(speed)) return;
    this.state.speed = speed;
    this.publish();
  }

  setLoop(loop: boolean) {
    this.state.loop = loop;
    this.publish();
  }

  update(delta: number) {
    if (!this.state.playing || !Number.isFinite(delta) || delta <= 0) return;
    // A background tab must not jump far ahead when it becomes visible again.
    const step = Math.min(delta, 0.1);
    let time = this.state.time + step * this.state.speed;
    if (time >= this.state.duration) {
      if (this.state.loop) time %= this.state.duration;
      else {
        time = this.state.duration;
        this.state.playing = false;
      }
    }
    this.state.time = time;
    this.updatePose();
    this.elapsed += step;
    // Update the timeline at 20 Hz without rerendering the complete viewer.
    if (this.elapsed >= 0.05 || !this.state.playing) this.publish();
  }

  reset() {
    this.mixer.stopAllAction();
    this.action = null;
    this.state = { ...this.state, clipIndex: -1, time: 0, duration: 0, playing: false };
    this.updatePose();
    this.publish();
  }

  dispose() {
    this.reset();
    this.mixer.uncacheRoot(this.model);
  }
}
