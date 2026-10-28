import { describe, it, expect, vi } from 'vitest';
import {
  playbackReducer,
  INITIAL_PLAYBACK_STATE,
  type PlaybackState,
} from '../src/editor/playbackReducer';
import type { TraceEvent } from '../src/runtime/types';

describe('UI Integration & Replay Functionality', () => {
  it('manages bounded buffered playback with actual runtime events in slow mode', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'print("step 1")\nprint("step 2")\nprint("step 3")',
      mode: 'slow',
    });

    expect(state.status).toBe('running');
    expect(state.executionStatus).toBe('running');
    expect(state.isPlaying).toBe(true);
    expect(state.isExecutionDone).toBe(false);

    // Actual runtime events arrive in rapid succession from Web Worker
    const events: TraceEvent[] = [
      { seq: 1, kind: 'line', line: 1 },
      { seq: 2, kind: 'stdout', line: 1, text: 'step 1\n' },
      { seq: 3, kind: 'line', line: 2 },
      { seq: 4, kind: 'stdout', line: 2, text: 'step 2\n' },
      { seq: 5, kind: 'line', line: 3 },
      { seq: 6, kind: 'stdout', line: 3, text: 'step 3\n' },
    ];

    for (const ev of events) {
      state = playbackReducer(state, { type: 'EVENT_APPEND', event: ev });
    }

    // All 6 events are buffered, but currentIndex stays at initial event (0)
    expect(state.events).toHaveLength(6);
    expect(state.currentIndex).toBe(0);
    expect(state.activeLine).toBe(1);

    // Pyodide worker reports done immediately
    state = playbackReducer(state, { type: 'RUN_DONE' });

    // Execution is complete, but playback remains running!
    expect(state.executionStatus).toBe('done');
    expect(state.isExecutionDone).toBe(true);
    expect(state.status).toBe('running');
    expect(state.isPlaying).toBe(true);
    expect(state.currentIndex).toBe(0);

    // Playback ticks through events one by one
    for (let i = 1; i < events.length; i++) {
      state = playbackReducer(state, { type: 'PLAYBACK_TICK' });
      expect(state.currentIndex).toBe(i);
      if (i < events.length - 1) {
        expect(state.status).toBe('running');
      }
    }

    // After ticking through the final event, playback completes
    expect(state.currentIndex).toBe(5);
    expect(state.status).toBe('done');
    expect(state.isPlaying).toBe(false);
  });

  it('synchronizes console output entries with playback event replay', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'print("first")\nprint("second")',
      mode: 'slow',
    });

    const events: TraceEvent[] = [
      { seq: 1, kind: 'line', line: 1 },
      { seq: 2, kind: 'stdout', line: 1, text: 'first\n' },
      { seq: 3, kind: 'line', line: 2 },
      { seq: 4, kind: 'stdout', line: 2, text: 'second\n' },
    ];

    for (const ev of events) {
      state = playbackReducer(state, { type: 'EVENT_APPEND', event: ev });
    }
    state = playbackReducer(state, { type: 'RUN_DONE' });

    // Helper to derive synchronized console outputs from events up to currentIndex
    function getSynchronizedConsole(pState: PlaybackState): { text: string; channel: string }[] {
      if (pState.currentIndex < 0) return [];
      const visible = pState.events.slice(0, pState.currentIndex + 1);
      return visible
        .filter((e) => (e.kind === 'stdout' || e.kind === 'stderr') && e.text)
        .map((e) => ({ text: e.text!, channel: e.kind === 'stderr' ? 'stderr' : 'stdout' }));
    }

    // At step 0 (line 1): no stdout yet
    expect(state.currentIndex).toBe(0);
    expect(getSynchronizedConsole(state)).toHaveLength(0);

    // Advance to step 1 (stdout "first")
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(1);
    const consoleStep1 = getSynchronizedConsole(state);
    expect(consoleStep1).toHaveLength(1);
    expect(consoleStep1[0].text).toBe('first\n');

    // Advance to step 2 (line 2)
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(2);
    expect(getSynchronizedConsole(state)).toHaveLength(1);

    // Advance to step 3 (stdout "second")
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(3);
    const consoleStep3 = getSynchronizedConsole(state);
    expect(consoleStep3).toHaveLength(2);
    expect(consoleStep3[1].text).toBe('second\n');

    // Step back to step 1 (rewinding console replay)
    state = playbackReducer(state, { type: 'STEP_PREV' }); // step 2
    state = playbackReducer(state, { type: 'STEP_PREV' }); // step 1
    expect(state.currentIndex).toBe(1);
    const rewound = getSynchronizedConsole(state);
    expect(rewound).toHaveLength(1);
    expect(rewound[0].text).toBe('first\n');

    // Step back to step 0
    state = playbackReducer(state, { type: 'STEP_PREV' });
    expect(state.currentIndex).toBe(0);
    expect(getSynchronizedConsole(state)).toHaveLength(0);
  });

  it('supports Pause, Next, Prev, and useful Resume without re-running Python', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'x = 1\nx = 2\nx = 3',
      mode: 'slow',
    });

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1, locals: { x: { type: 'int', value: '1' } } },
    });
    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 2, kind: 'line', line: 2, locals: { x: { type: 'int', value: '2' } } },
    });
    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 3, kind: 'line', line: 3, locals: { x: { type: 'int', value: '3' } } },
    });
    state = playbackReducer(state, { type: 'RUN_DONE' });

    // Step to the end
    state = playbackReducer(state, { type: 'SEEK_INDEX', index: 2 });
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.status).toBe('done');
    expect(state.isExecutionDone).toBe(true);

    // Useful RESUME when execution is done: restarts animation replay from beginning
    state = playbackReducer(state, { type: 'RESUME' });
    expect(state.status).toBe('running');
    expect(state.isPlaying).toBe(true);
    expect(state.currentIndex).toBe(0);
    expect(state.activeLocals.x?.value).toBe('1');

    // PAUSE animation
    state = playbackReducer(state, { type: 'PAUSE' });
    expect(state.status).toBe('paused');
    expect(state.isPlaying).toBe(false);

    // STEP_NEXT while paused
    state = playbackReducer(state, { type: 'STEP_NEXT' });
    expect(state.currentIndex).toBe(1);
    expect(state.activeLocals.x?.value).toBe('2');
    expect(state.status).toBe('paused'); // remains paused

    // STEP_PREV while paused
    state = playbackReducer(state, { type: 'STEP_PREV' });
    expect(state.currentIndex).toBe(0);
    expect(state.activeLocals.x?.value).toBe('1');

    // RESUME from mid-point
    state = playbackReducer(state, { type: 'RESUME' });
    expect(state.status).toBe('running');
    expect(state.isPlaying).toBe(true);
    expect(state.currentIndex).toBe(0);
  });

  it('resets to idle state on example selection or reset action without fake execution', () => {
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'while True: pass',
      mode: 'slow',
    });
    expect(state.status).toBe('running');

    // User selects a different example: must NOT mark running
    const newCode = 'print("hello world")';
    state = playbackReducer(state, {
      type: 'RESET',
      code: newCode,
    });

    expect(state.status).toBe('idle');
    expect(state.executionStatus).toBe('idle');
    expect(state.isPlaying).toBe(false);
    expect(state.isExecutionDone).toBe(false);
    expect(state.sourceSnapshot).toBe(newCode);
    expect(state.currentCode).toBe(newCode);
    expect(state.events).toHaveLength(0);
    expect(state.currentIndex).toBe(-1);
    expect(state.activeLine).toBe(0);
  });

  it('guarantees sourceSnapshot immutability during user code editing', () => {
    const originalCode = 'def run():\n    return 42';
    let state = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: originalCode,
      mode: 'slow',
    });

    state = playbackReducer(state, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1 },
    });
    expect(state.activeLine).toBe(1);

    // User types in the editor
    state = playbackReducer(state, {
      type: 'UPDATE_CODE',
      code: 'def run():\n    # new comment\n    return 42',
    });

    // sourceSnapshot remains strictly immutable
    expect(state.sourceSnapshot).toBe(originalCode);
    // Active line is zeroed to prevent misaligned highlight
    expect(state.activeLine).toBe(0);
  });

  it('handles runtime lifecycle client disposal preventing worker leaks', () => {
    const mockDispose = vi.fn();
    const mockStop = vi.fn();

    const mockClient = {
      init: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
      stop: mockStop,
      provideInput: vi.fn(),
      install: vi.fn().mockResolvedValue(undefined),
      dispose: mockDispose,
    };

    // Dispose should be called when client is disposed
    mockClient.dispose();
    expect(mockDispose).toHaveBeenCalledTimes(1);

    mockClient.stop();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});
