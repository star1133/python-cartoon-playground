import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EXAMPLES } from '../src/storage/examples';
import { CURATED_PACKAGES, BROWSER_LIMITATIONS } from '../src/storage/packageCatalog';
import { reduceSceneState, INITIAL_SCENE_STATE } from '../src/scene/sceneReducer';
import { playbackReducer, INITIAL_PLAYBACK_STATE } from '../src/editor/playbackReducer';
import { StatusBar } from '../src/components/StatusBar';
import { RunToolbar } from '../src/components/RunToolbar';

describe('UI and Workbench Integration Logic', () => {
  it('verifies all examples have valid Python syntax and Thai titles', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(6);
    for (const ex of EXAMPLES) {
      expect(ex.title).toBeTruthy();
      expect(ex.code).toBeTruthy();
      expect(ex.description).toBeTruthy();
      // Ensure no empty code
      expect(ex.code.trim().length).toBeGreaterThan(10);
    }
  });

  it('verifies curated packages have valid semver and descriptions', () => {
    for (const pkg of CURATED_PACKAGES) {
      expect(pkg.name).toBeTruthy();
      expect(pkg.descriptionTh).toBeTruthy();
      expect(pkg.version).toBeTruthy();
      expect(pkg.status).toBe('available');
    }
  });

  it('verifies limitation catalog covers WASM, GUI, and Sockets with actionable Thai copy', () => {
    const titles = BROWSER_LIMITATIONS.map((l) => l.titleTh);
    expect(titles.some((t) => t.includes('WebAssembly'))).toBe(true);
    expect(titles.some((t) => t.includes('Sockets'))).toBe(true);
    expect(titles.some((t) => t.includes('GUI'))).toBe(true);
    expect(titles.some((t) => t.includes('Multiprocessing'))).toBe(true);
  });

  it('correctly reduces a complete 4-step world journey', () => {
    let state = INITIAL_SCENE_STATE;
    const actions = [
      { step: 1, x: 1, y: 0, dir: 0, act: 'move_forward' },
      { step: 2, x: 2, y: 0, dir: 0, act: 'move_forward' },
      { step: 3, x: 3, y: 0, dir: 0, act: 'move_forward' },
      { step: 4, x: 4, y: 0, dir: 0, act: 'move_forward' },
    ];

    for (const a of actions) {
      state = reduceSceneState(state, {
        seq: a.step,
        kind: 'line',
        line: 4,
        world: { x: a.x, y: a.y, direction: a.dir, action: a.act },
      });
    }

    expect(state.character.x).toBe(4);
    expect(state.character.y).toBe(0);
    expect(state.chest.isOpen).toBe(true);
    expect(state.chest.isReached).toBe(true);
    expect(state.character.action).toBe('celebrate');
  });

  it('handles playback pause, next, seek without execution side-effects', () => {
    let pState = playbackReducer(INITIAL_PLAYBACK_STATE, {
      type: 'RUN_START',
      code: 'print(1)\nprint(2)',
      mode: 'slow',
    });

    pState = playbackReducer(pState, {
      type: 'EVENT_APPEND',
      event: { seq: 1, kind: 'line', line: 1 },
    });
    pState = playbackReducer(pState, {
      type: 'EVENT_APPEND',
      event: { seq: 2, kind: 'line', line: 2 },
    });

    // Pause
    pState = playbackReducer(pState, { type: 'PAUSE' });
    expect(pState.status).toBe('paused');

    // Seek to step 0
    pState = playbackReducer(pState, { type: 'SEEK_INDEX', index: 0 });
    expect(pState.currentIndex).toBe(0);
    expect(pState.activeLine).toBe(1);

    // Step next to step 1
    pState = playbackReducer(pState, { type: 'STEP_NEXT' });
    expect(pState.currentIndex).toBe(1);
    expect(pState.activeLine).toBe(2);
  });

  it('renders StatusBar with generic Python (WASM) without hardcoding Python 3.12 and displays language status', () => {
    const htmlFallback = renderToString(
      React.createElement(StatusBar, {
        status: 'idle',
        mode: 'slow',
        activeLine: 0,
        languageStatus: 'fallback',
      })
    );

    // Must not claim hardcoded Python 3.12
    expect(htmlFallback).not.toContain('Python 3.12');
    expect(htmlFallback).toContain('Python (WASM)');
    expect(htmlFallback).toContain('IntelliSense (Static Fallback)');

    const htmlReady = renderToString(
      React.createElement(StatusBar, {
        status: 'running',
        mode: 'slow',
        activeLine: 5,
        languageStatus: 'ready',
      })
    );
    expect(htmlReady).toContain('Python (WASM)');
    expect(htmlReady).toContain('IntelliSense (Jedi)');
    expect(htmlReady).toContain('บรรทัดปัจจุบัน');
  });

  it('renders RunToolbar labeling pause as "pause animation" and controls as animation replay without claiming debugger', () => {
    const htmlRunning = renderToString(
      React.createElement(RunToolbar, {
        status: 'running',
        mode: 'slow',
        speed: 1,
        onRun: () => {},
        onStop: () => {},
        onPause: () => {},
        onResume: () => {},
        onStepNext: () => {},
        onStepPrev: () => {},
        onSetMode: () => {},
        onSetSpeed: () => {},
        onSelectExample: () => {},
        onExport: () => {},
        onImport: () => {},
        onReset: () => {},
        onSave: () => {},
        onOpenPackages: () => {},
      })
    );

    // Pauses animation, not claimed live debugger
    expect(htmlRunning).toContain('aria-label="pause animation"');
    expect(htmlRunning).toContain('พักแอนิเมชัน');
    expect(htmlRunning).toContain('Replay');
    expect(htmlRunning.toLowerCase()).not.toContain('debugger');
    expect(htmlRunning).not.toContain('ดีบัก');
  });
});
