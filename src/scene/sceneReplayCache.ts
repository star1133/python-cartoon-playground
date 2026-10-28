import type { TraceEvent } from '../runtime/types';
import { INITIAL_SCENE_STATE, reduceSceneState, type SceneState } from './sceneReducer';

/** Bounded in-memory checkpoints; never executes Python, resets when trace identity changes. */
export function createSceneReplayCache(stride = 32, maximumCheckpoints = 96) {
  const step = Math.max(1, Math.floor(stride));
  const cap = Math.max(2, Math.floor(maximumCheckpoints));
  let first: TraceEvent | undefined;
  let last: TraceEvent | undefined;
  let length = 0;
  const checkpoints = new Map<number, SceneState>();
  const reset = () => { checkpoints.clear(); first = undefined; last = undefined; length = 0; };
  return {
    clear: reset,
    get checkpointCount() { return checkpoints.size; },
    get(events: TraceEvent[], index: number): SceneState {
      // Immutable trace events are a requirement; append is allowed, replacement is a new run.
      if (events[0] !== first || events.length < length || (length && events[length - 1] !== last)) reset();
      first = events[0]; length = events.length; last = events[length - 1];
      if (!length || index < 0) return INITIAL_SCENE_STATE;
      const target = Math.min(Math.floor(index), length - 1);
      let start = -1;
      let state = INITIAL_SCENE_STATE;
      for (const [position, snapshot] of checkpoints) {
        if (position <= target && position > start) { start = position; state = snapshot; }
      }
      for (let i = start + 1; i <= target; i++) {
        state = reduceSceneState(state, events[i]);
        if (i % step === 0 || i === target) {
          checkpoints.delete(i);
          checkpoints.set(i, state);
          while (checkpoints.size > cap) checkpoints.delete(checkpoints.keys().next().value!);
        }
      }
      return state;
    },
  };
}
