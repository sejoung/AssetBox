import { useSyncExternalStore } from "react";
import type { AnimationPlayback } from "../lib/animationPlayback";

export function AnimationControls({
  player,
  disabledReason,
}: {
  player: AnimationPlayback;
  disabledReason?: string;
}) {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot);
  if (!player.clips.length) return null;
  const disabled = !!disabledReason;
  return (
    <section className="animation-controls" aria-label="Animation preview">
      <div className="animation-actions">
        <label className="animation-clip">
          <span>Animation</span>
          <select
            aria-label="Animation clip"
            value={state.clipIndex}
            disabled={disabled}
            onChange={(event) => player.select(Number(event.target.value))}
          >
            <option value={-1}>Original pose</option>
            {player.clips.map((clip, index) => (
              <option key={clip.uuid} value={index}>
                {clip.name || `Clip ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button
          className="ui-button"
          disabled={disabled}
          onClick={() => player.togglePlaying()}
          aria-label={state.playing ? "Pause animation" : "Play animation"}
        >
          {state.playing ? "Pause" : "Play"}
        </button>
        <button
          className="ui-button"
          disabled={disabled || state.clipIndex < 0}
          onClick={() => player.reset()}
        >
          Reset pose
        </button>
        <select
          aria-label="Playback speed"
          value={state.speed}
          disabled={disabled}
          onChange={(event) => player.setSpeed(Number(event.target.value))}
        >
          {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
        <label className="animation-loop">
          <input
            type="checkbox"
            checked={state.loop}
            disabled={disabled}
            onChange={(event) => player.setLoop(event.target.checked)}
          />{" "}
          Loop
        </label>
      </div>
      <div className="animation-timeline">
        <input
          type="range"
          aria-label="Animation time"
          min={0}
          max={state.duration || 1}
          step="any"
          value={state.time}
          disabled={disabled || state.clipIndex < 0}
          aria-valuetext={`${state.time.toFixed(2)} of ${state.duration.toFixed(2)} seconds`}
          onChange={(event) => player.seek(Number(event.target.value))}
        />
        <span className="animation-time">
          {state.time.toFixed(2)} / {state.duration.toFixed(2)} s
        </span>
      </div>
      {disabledReason && <p className="stat-hint">{disabledReason}</p>}
    </section>
  );
}
