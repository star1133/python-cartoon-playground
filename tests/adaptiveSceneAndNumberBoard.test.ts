import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  reduceSceneState,
  reduceSceneStateHistory,
  INITIAL_SCENE_STATE,
  type SceneState,
} from '../src/scene/sceneReducer';
import { AdaptiveExecutionScene } from '../src/scene/AdaptiveExecutionScene';
import { NumberBoard2D } from '../src/scene/NumberBoard2D';
import type { TraceEvent } from '../src/runtime/types';

describe('AdaptiveExecutionScene and NumberBoard2D (Strict TDD Tests)', () => {
  // Test 1: generic -> 2D board
  it('1. routes generic Python execution to 2D NumberBoard and does not render 3D world scene', () => {
    const genericState: SceneState = {
      ...INITIAL_SCENE_STATE,
      isWorldMode: false,
      genericModel: {
        ...INITIAL_SCENE_STATE.genericModel,
        variables: [
          {
            name: 'x',
            type: 'int',
            value: '42',
            rawPreview: '42',
            isChanged: true,
            isNew: true,
            gridIndex: 0,
            parsed: { type: 'int', preview: '42', isTruncated: false, rawValue: '42' },
          },
        ],
        totalVariablesCount: 1,
      },
    };

    const html = renderToString(
      React.createElement(AdaptiveExecutionScene, {
        sceneState: genericState,
      })
    );

    // Must contain 2D NumberBoard elements
    expect(html).toContain('number-board-2d');
    expect(html).toContain('42');
    expect(html).toContain('x');
    // Must NOT contain 3D world canvas container
    expect(html).not.toContain('three-world-canvas');
  });

  // Test 2: actual world -> 3D scene
  it('2. routes actual character movement (world action) to IsometricWorldScene (3D scene)', () => {
    const moveEvent: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 3,
      world: { x: 1, y: 0, direction: 0, action: 'move_forward' },
    };
    const worldState = reduceSceneState(INITIAL_SCENE_STATE, moveEvent);
    expect(worldState.isWorldMode).toBe(true);

    const html = renderToString(
      React.createElement(AdaptiveExecutionScene, {
        sceneState: worldState,
      })
    );

    // Must route to 3D world scene
    expect(html).toContain('scene-canvas-container');
    expect(html).toContain('แผนที่โลกจำลอง');
    // Must NOT render 2D NumberBoard container
    expect(html).not.toContain('number-board-2d');
  });

  // Test 3: idle snapshot not world
  it('3. treats idle world snapshot as generic 2D NumberBoard, preserving 2D mode', () => {
    const idleEvent: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 1,
      world: { x: 0, y: 0, direction: 0, action: 'idle' },
      locals: {
        a: { type: 'int', value: '100' },
      },
    };
    const idleState = reduceSceneState(INITIAL_SCENE_STATE, idleEvent);
    expect(idleState.isWorldMode).toBe(false);

    const html = renderToString(
      React.createElement(AdaptiveExecutionScene, {
        sceneState: idleState,
      })
    );

    expect(html).toContain('number-board-2d');
    expect(html).toContain('100');
    expect(html).not.toContain('three-scene-container');
  });

  // Test 4: displayed 0, negative, and float values
  it('4. accurately displays 0, negative integers, floats, and negative floats with front-facing numbers', () => {
    const numberTestEvent: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 4,
      locals: {
        zero_val: { type: 'int', value: '0' },
        neg_int: { type: 'int', value: '-42' },
        pi_val: { type: 'float', value: '3.14159' },
        neg_float: { type: 'float', value: '-0.75' },
        float_zero: { type: 'float', value: '0.0' },
      },
    };
    const state = reduceSceneState(INITIAL_SCENE_STATE, numberTestEvent);

    const html = renderToString(
      React.createElement(NumberBoard2D, {
        sceneState: state,
      })
    );

    // Checks literal tokens are preserved and not replaced by empty string or falsy fallback
    expect(html).toContain('zero_val');
    expect(html).toContain('>0<');
    expect(html).toContain('neg_int');
    expect(html).toContain('-42');
    expect(html).toContain('pi_val');
    expect(html).toContain('3.14159');
    expect(html).toContain('neg_float');
    expect(html).toContain('-0.75');
    expect(html).toContain('float_zero');
    expect(html).toContain('0.0');
    // Ensure large front-facing number class is applied
    expect(html).toContain('nb2d-number-val');
  });

  // Test 5: changed values/previous (before -> after transfer)
  it('5. clearly shows before -> after values and new variable indicators when values update', () => {
    const step1: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 1,
      locals: {
        count: { type: 'int', value: '10' },
      },
    };
    const s1 = reduceSceneState(INITIAL_SCENE_STATE, step1);

    const step2: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 2,
      locals: {
        count: { type: 'int', value: '25' },
        bonus: { type: 'float', value: '5.5' },
      },
    };
    const s2 = reduceSceneState(s1, step2);

    const html = renderToString(
      React.createElement(NumberBoard2D, {
        sceneState: s2,
      })
    );

    // count changed from 10 to 25
    expect(html).toContain('count');
    expect(html).toContain('25');
    expect(html).toContain('10'); // Previous value visible
    expect(html).toContain('nb2d-val-changed');
    expect(html).toContain('nb2d-prev-val');

    // bonus is newly created
    expect(html).toContain('bonus');
    expect(html).toContain('5.5');
    expect(html).toContain('nb2d-new-badge');
  });

  // Test 6: no stale replay on backwards seek and vars retained on stdout
  it('6. deterministically computes state on backwards seek and retains vars when locals absent on stdout', () => {
    const events: TraceEvent[] = [
      {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: { x: { type: 'int', value: '10' } },
      },
      {
        seq: 2,
        kind: 'line',
        line: 2,
        locals: { x: { type: 'int', value: '20' } },
      },
      {
        seq: 3,
        kind: 'line',
        line: 3,
        locals: { x: { type: 'int', value: '30' } },
      },
      {
        seq: 4,
        kind: 'stdout',
        line: 3,
        text: 'Value is 30\n',
        // locals intentionally absent/undefined to test contract
      },
    ];

    // At step 4 (index 3): stdout event with undefined locals
    const stateAtStep4 = reduceSceneStateHistory(events, 3);
    // Should retain x=30 from previous step even though locals is undefined
    expect(stateAtStep4.genericModel.variables).toHaveLength(1);
    expect(stateAtStep4.genericModel.variables[0]?.value).toBe('30');
    expect(stateAtStep4.genericModel.recentStdout).toBe('Value is 30');

    // Now seek backward to step 1 (index 0) where x=10
    const stateAtStep1 = reduceSceneStateHistory(events, 0);
    expect(stateAtStep1.genericModel.variables).toHaveLength(1);
    expect(stateAtStep1.genericModel.variables[0]?.value).toBe('10');
    expect(stateAtStep1.genericModel.variables[0]?.previousValue).toBeUndefined();
    // recentStdout must be clean/null (not stale 'Value is 30' from future!)
    expect(stateAtStep1.genericModel.recentStdout).toBeNull();
  });

  // Test 7: Helpful Thai empty state before run
  it('7. displays helpful Thai empty state when no variables have been executed yet', () => {
    const html = renderToString(
      React.createElement(NumberBoard2D, {
        sceneState: INITIAL_SCENE_STATE,
      })
    );

    expect(html).toContain('nb2d-empty-state');
    expect(html).toContain('กระดานแสดงค่าตัวเลขและการคำนวณ 2D');
    expect(html).toContain('พร้อมประมวลผลโค้ด Python');
  });

  // Test 8: List chips display without eval
  it('8. renders list chips and container elements safely without eval', () => {
    const listEvent: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 2,
      locals: {
        numbers: { type: 'list', value: '[10, 20, 30]' },
      },
    };
    const state = reduceSceneState(INITIAL_SCENE_STATE, listEvent);

    const html = renderToString(
      React.createElement(NumberBoard2D, {
        sceneState: state,
      })
    );

    expect(html).toContain('numbers');
    expect(html).toContain('nb2d-container-chip');
    expect(html).toContain('10');
    expect(html).toContain('20');
    expect(html).toContain('30');
  });

  // Test 9: Honest source line display without inferred arithmetic
  it('9. displays exact active source line without inferred arithmetic claims', () => {
    const state = INITIAL_SCENE_STATE;
    const sourceCode = 'x = 15\ny = 25\nz = x * y';
    const html = renderToString(
      React.createElement(NumberBoard2D, {
        sceneState: state,
        activeLine: 3,
        sourceSnapshot: sourceCode,
      })
    );

    expect(html).toContain('บรรทัด 3:');
    expect(html).toContain('z = x * y');
  });

  // Test 10: Prominent front-facing 3-phase arrow explanation integration
  it('10. renders prominent front-facing 3-phase flow explanation with arrows and Thai labels', () => {
    const s1 = reduceSceneState(INITIAL_SCENE_STATE, {
      seq: 1,
      kind: 'line',
      line: 1,
      locals: { a: { type: 'int', value: '10' } },
    });
    const s2 = reduceSceneState(s1, {
      seq: 2,
      kind: 'line',
      line: 2,
      locals: { a: { type: 'int', value: '25' } },
    });

    const html = renderToString(
      React.createElement(NumberBoard2D, {
        sceneState: s2,
        initialPhase: 2,
        isPlaying: false,
      })
    );

    expect(html).toContain('data-testid="flow-explanation"');
    expect(html).toContain('data-testid="phase-prev"');
    expect(html).toContain('data-testid="phase-next"');
    expect(html).toContain('data-testid="flow-phase-1"');
    expect(html).toContain('data-testid="flow-phase-2"');
    expect(html).toContain('data-testid="flow-phase-3"');
    expect(html).toContain('data-testid="phase-indicator"');
    expect(html).toContain('data-testid="flow-node-prev"');
    expect(html).toContain('data-testid="flow-arrow-1"');
    expect(html).toContain('data-testid="flow-node-new"');
    expect(html).toContain('data-testid="flow-arrow-2"');
    expect(html).toContain('data-testid="flow-node-dest"');
    expect(html).toContain('10');
    expect(html).toContain('25');
    expect(html).toContain('a');
  });
});
