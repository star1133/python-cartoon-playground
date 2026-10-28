import { describe, it, expect } from 'vitest';
import {
  playbackReducer,
  INITIAL_PLAYBACK_STATE,
  type PlaybackState,
} from '../src/editor/playbackReducer';
import type { TraceEvent } from '../src/runtime/types';

describe('playbackReducer', () => {
  it('initializes clean state on RUN_START', () => {
    const code = 'print("hello")';
    const state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code,
      mode: 'slow',
    });

    expect(state.status).toBe('running');
    expect(state.executionStatus).toBe('running');
    expect(state.isExecutionDone).toBe(false);
    expect(state.isPlaying).toBe(true);
    expect(state.sourceSnapshot).toBe(code);
    expect(state.currentCode).toBe(code);
    expect(state.events).toHaveLength(0);
    expect(state.currentIndex).toBe(-1);
    expect(state.activeLine).toBe(0);
  });

  it('resets to idle state on RESET without marking running', () => {
    const code = 'print("idle code")';
    const runningState = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'old = 1',
      mode: 'slow',
    });
    expect(runningState.status).toBe('running');

    const resetState = playbackReducer(runningState, {
      type: 'RESET',
      code,
    });

    expect(resetState.status).toBe('idle');
    expect(resetState.executionStatus).toBe('idle');
    expect(resetState.isPlaying).toBe(false);
    expect(resetState.isExecutionDone).toBe(false);
    expect(resetState.sourceSnapshot).toBe(code);
    expect(resetState.currentCode).toBe(code);
    expect(resetState.events).toHaveLength(0);
    expect(resetState.currentIndex).toBe(-1);
  });

  it('buffers events in slow mode without jumping to end immediately', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'x = 10\nprint(x)\ny = 20',
      mode: 'slow',
    });

    const evt1: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 1,
      locals: { x: { type: 'int', value: '10' } },
    };
    state = playbackReducer(state, { type: 'EVENT_APPEND', event: evt1 });

    // First event initializes currentIndex to 0
    expect(state.events).toHaveLength(1);
    expect(state.currentIndex).toBe(0);
    expect(state.activeLine).toBe(1);
    expect(state.activeLocals.x?.value).toBe('10');

    const evt2: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 2,
    };
    state = playbackReducer(state, { type: 'EVENT_APPEND', event: evt2 });

    // In slow mode: buffered! currentIndex remains 0 until timer or step advances
    expect(state.events).toHaveLength(2);
    expect(state.currentIndex).toBe(0);
    expect(state.activeLine).toBe(1);

    const evt3: TraceEvent = {
      seq: 3,
      kind: 'line',
      line: 3,
      locals: { y: { type: 'int', value: '20' } },
    };
    state = playbackReducer(state, { type: 'EVENT_APPEND', event: evt3 });
    expect(state.events).toHaveLength(3);
    expect(state.currentIndex).toBe(0);

    // STEP_NEXT advances through buffered events
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(1);
    expect(state.activeLine).toBe(2);

    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(2);
    expect(state.activeLine).toBe(3);
    expect(state.activeLocals.y?.value).toBe('20');
  });

  it('jumps to end on EVENT_APPEND in normal mode', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'a = 1\nb = 2',
      mode: 'normal',
    });

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1 },
    });
    expect(state.currentIndex).toBe(0);

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 2, kind: 'line', line: 2 },
    });
    expect(state.currentIndex).toBe(1);
    expect(state.activeLine).toBe(2);
  });

  it('separates execution completion from playback playing state', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'for i in range(3): pass',
      mode: 'slow',
    });

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1 },
    });
    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 2, kind: 'line', line: 2 },
    });
    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 3, kind: 'line', line: 3 },
    });

    // Execution completes in worker while playback is still at step 0
    state = playbackReducer(state, { type: 'RUN_DONE' });

    // Execution is marked done, but playback status is STILL running
    expect(state.executionStatus).toBe('done');
    expect(state.isExecutionDone).toBe(true);
    expect(state.status).toBe('running');
    expect(state.currentIndex).toBe(0);

    // Playback advances
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(1);
    expect(state.status).toBe('running');

    // Reaching the last event completes playback
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(2);
    expect(state.status).toBe('done');
    expect(state.isPlaying).toBe(false);
  });

  it('supports stepping backward (PREV) and forward (NEXT) with reconstructed locals', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'a = 1\nb = 2\nc = 3',
      mode: 'slow',
    });

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1, locals: { a: { type: 'int', value: '1' } } },
    });
    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 2, kind: 'line', line: 2, locals: { b: { type: 'int', value: '2' } } },
    });
    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 3, kind: 'line', line: 3, locals: { c: { type: 'int', value: '3' } } },
    });

    // Advance to end
    state = playbackReducer(state, { type: 'SEEK_INDEX', index: 2 });
    expect(state.currentIndex).toBe(2);
    expect(state.activeLocals.a?.value).toBe('1');
    expect(state.activeLocals.b?.value).toBe('2');
    expect(state.activeLocals.c?.value).toBe('3');

    // Step back to step 1 (where c was not yet defined)
    state = playbackReducer(state, { type: 'STEP_PREV' });
    expect(state.currentIndex).toBe(1);
    expect(state.activeLine).toBe(2);
    expect(state.activeLocals.a?.value).toBe('1');
    expect(state.activeLocals.b?.value).toBe('2');
    expect(state.activeLocals.c).toBeUndefined();

    // Step back to step 0 (where only a was defined)
    state = playbackReducer(state, { type: 'STEP_PREV' });
    expect(state.currentIndex).toBe(0);
    expect(state.activeLine).toBe(1);
    expect(state.activeLocals.a?.value).toBe('1');
    expect(state.activeLocals.b).toBeUndefined();

    // Cannot step back before 0
    state = playbackReducer(state, { type: 'STEP_PREV' });
    expect(state.currentIndex).toBe(0);

    // Step forward restores b
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(1);
    expect(state.activeLocals.b?.value).toBe('2');
  });

  it('supports useful RESUME after execution is complete', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'print(1)\nprint(2)',
      mode: 'slow',
    });

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1 },
    });
    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 2, kind: 'line', line: 2 },
    });
    state = playbackReducer(state, { type: 'RUN_DONE' });

    // Step to the end
    state = playbackReducer(state, { type: 'SEEK_INDEX', index: 1 });
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.status).toBe('done');

    // Resume when at the end restarts playback from beginning
    state = playbackReducer(state, { type: 'RESUME' });
    expect(state.status).toBe('running');
    expect(state.isPlaying).toBe(true);
    expect(state.currentIndex).toBe(0);

    // Pause
    state = playbackReducer(state, { type: 'PAUSE' });
    expect(state.status).toBe('paused');
    expect(state.isPlaying).toBe(false);

    // Resume from paused position
    state = playbackReducer(state, { type: 'RESUME' });
    expect(state.status).toBe('running');
    expect(state.currentIndex).toBe(0);
  });

  it('clears activeLine highlight if user edits code after run snapshot', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'print("start")',
      mode: 'slow',
    });

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1 },
    });

    expect(state.activeLine).toBe(1);

    // User modifies code in editor
    state = playbackReducer(state, {
      type: 'UPDATE_CODE',
      code: 'print("modified code")',
    });

    // Active line highlight should be zeroed to prevent highlighting mismatched line
    expect(state.activeLine).toBe(0);

    // Reverting code restores highlight when seeking or stepping
    state = playbackReducer(state, {
      type: 'UPDATE_CODE',
      code: 'print("start")',
    });
    state = playbackReducer(state, { type: 'SEEK_INDEX', index: 0 });
    expect(state.activeLine).toBe(1);
  });

  it('respects bounded maxEvents limit', () => {
    let state: PlaybackState = {
      ...INITIAL_PLAYBACK_STATE,
      maxEvents: 3,
    };
    state = playbackReducer(state, {
      type: 'RUN_START',
      code: 'infinite loop simulation',
      mode: 'slow',
    });

    state = playbackReducer(state, { type: 'EVENT_APPEND', event: { seq: 1, kind: 'line', line: 1 } });
    state = playbackReducer(state, { type: 'EVENT_APPEND', event: { seq: 2, kind: 'line', line: 1 } });
    state = playbackReducer(state, { type: 'EVENT_APPEND', event: { seq: 3, kind: 'line', line: 1 } });
    // 4th event should not exceed limit
    state = playbackReducer(state, { type: 'EVENT_APPEND', event: { seq: 4, kind: 'line', line: 1 } });

    expect(state.events).toHaveLength(3);
  });

  it('manages pause, resume, stop, and speed settings', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'a = 1',
      mode: 'slow',
    });

    state = playbackReducer(state, { type: 'PAUSE' });
    expect(state.status).toBe('paused');

    state = playbackReducer(state, { type: 'RESUME' });
    expect(state.status).toBe('running');

    state = playbackReducer(state, { type: 'STOP' });
    expect(state.status).toBe('stopped');

    state = playbackReducer(state, { type: 'SET_SPEED', speed: 2 });
    expect(state.speed).toBe(2);
  });
});
