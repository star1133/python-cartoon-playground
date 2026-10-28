import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  reduceSceneState,
  INITIAL_SCENE_STATE,
  MAX_DISPLAY_VARIABLES,
  type SceneState,
} from '../src/scene/sceneReducer';
import { createVariableStage } from '../src/scene/variableStageMesh';
import { createCharacterMesh } from '../src/scene/characterMesh';
import { parseSafeValue } from '../src/scene/safeValueParser';
import { IsometricWorldScene } from '../src/scene/IsometricWorldScene';
import type { TraceEvent } from '../src/runtime/types';

describe('Generic Python Visualization - Deterministic Scene & Model Tests', () => {
  it('1. Simple sums: visualizes step-by-step dataflow without world commands', () => {
    // x = 10; y = 20; total = x + y; print(total)
    const step1: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 1,
      locals: {},
    };
    const s1 = reduceSceneState(INITIAL_SCENE_STATE, step1);
    expect(s1.isWorldMode).toBe(false);
    expect(s1.genericModel.variables).toHaveLength(0);

    // After line 1 runs: x is assigned 10
    const step2: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 2,
      locals: {
        x: { type: 'int', value: '10' },
      },
    };
    const s2 = reduceSceneState(s1, step2);
    expect(s2.genericModel.variables).toHaveLength(1);
    expect(s2.genericModel.variables[0]?.name).toBe('x');
    expect(s2.genericModel.variables[0]?.value).toBe('10');
    expect(s2.genericModel.variables[0]?.isNew).toBe(true);
    expect(s2.genericModel.variables[0]?.isChanged).toBe(true);
    expect(s2.genericModel.lastChangedVar).toBe('x');
    expect(s2.character.action).toBe('walk'); // Character steps toward updated variable box

    // After line 2 runs: y is assigned 20
    const step3: TraceEvent = {
      seq: 3,
      kind: 'line',
      line: 3,
      locals: {
        x: { type: 'int', value: '10' },
        y: { type: 'int', value: '20' },
      },
    };
    const s3 = reduceSceneState(s2, step3);
    expect(s3.genericModel.variables).toHaveLength(2);
    expect(s3.genericModel.variables[1]?.name).toBe('y');
    expect(s3.genericModel.variables[1]?.isNew).toBe(true);
    expect(s3.genericModel.variables[0]?.isChanged).toBe(false); // x did not change
    expect(s3.genericModel.lastChangedVar).toBe('y');

    // After line 3 runs: total is assigned 30
    const step4: TraceEvent = {
      seq: 4,
      kind: 'line',
      line: 4,
      locals: {
        x: { type: 'int', value: '10' },
        y: { type: 'int', value: '20' },
        total: { type: 'int', value: '30' },
      },
    };
    const s4 = reduceSceneState(s3, step4);
    expect(s4.genericModel.variables).toHaveLength(3);
    const totalVar = s4.genericModel.variables.find((v) => v.name === 'total');
    expect(totalVar?.value).toBe('30');
    expect(totalVar?.isChanged).toBe(true);

    // Line 4 stdout: print(total) -> "30"
    const step5: TraceEvent = {
      seq: 5,
      kind: 'stdout',
      line: 4,
      text: '30\n',
      locals: s4.prevLocals,
    };
    const s5 = reduceSceneState(s4, step5);
    expect(s5.genericModel.recentStdout).toBe('30');
    expect(s5.statusMessageTh).toContain('พิมพ์ออกคอนโซล: "30"');
  });

  it('2. Loop accumulation: visually tracks loop repetitions from repeated trace lines', () => {
    // total = 0; for i in range(3): total += i
    let state = INITIAL_SCENE_STATE;

    // Iteration 0: i = 0, total = 0
    state = reduceSceneState(state, {
      seq: 1,
      kind: 'line',
      line: 2, // for i in range(3)
      locals: { total: { type: 'int', value: '0' }, i: { type: 'int', value: '0' } },
    });
    expect(state.genericModel.loopInfo).toBeNull(); // First visit

    state = reduceSceneState(state, {
      seq: 2,
      kind: 'line',
      line: 3, // total += i
      locals: { total: { type: 'int', value: '0' }, i: { type: 'int', value: '0' } },
    });

    // Iteration 1: line 2 visited second time
    state = reduceSceneState(state, {
      seq: 3,
      kind: 'line',
      line: 2,
      locals: { total: { type: 'int', value: '0' }, i: { type: 'int', value: '1' } },
    });
    expect(state.genericModel.loopInfo?.isLooping).toBe(true);
    expect(state.genericModel.loopInfo?.iterationCount).toBe(2);
    expect(state.genericModel.loopInfo?.activeLine).toBe(2);

    state = reduceSceneState(state, {
      seq: 4,
      kind: 'line',
      line: 3,
      locals: { total: { type: 'int', value: '1' }, i: { type: 'int', value: '1' } },
    });

    // Iteration 2: line 2 visited third time
    state = reduceSceneState(state, {
      seq: 5,
      kind: 'line',
      line: 2,
      locals: { total: { type: 'int', value: '1' }, i: { type: 'int', value: '2' } },
    });
    expect(state.genericModel.loopInfo?.isLooping).toBe(true);
    expect(state.genericModel.loopInfo?.iterationCount).toBe(3);
  });

  it('3. Function call and return: manages call stack stations and return token', () => {
    // def add(a, b): return a + b
    // res = add(2, 3)
    const callEvt: TraceEvent = {
      seq: 1,
      kind: 'call',
      line: 1,
      name: 'add',
      locals: { a: { type: 'int', value: '2' }, b: { type: 'int', value: '3' } },
      stack: ['<module>', 'add'],
    };
    const sCall = reduceSceneState(INITIAL_SCENE_STATE, callEvt);
    expect(sCall.callStackDepth).toBe(2);
    expect(sCall.character.action).toBe('cast');
    expect(sCall.genericModel.callStack).toHaveLength(2);
    expect(sCall.genericModel.callStack[1]?.frameName).toBe('add');
    expect(sCall.genericModel.callStack[1]?.isActive).toBe(true);
    expect(sCall.statusMessageTh).toContain('เรียกฟังก์ชัน add()');

    const returnEvt: TraceEvent = {
      seq: 2,
      kind: 'return',
      line: 2,
      name: 'add',
      text: '5',
      locals: { a: { type: 'int', value: '2' }, b: { type: 'int', value: '3' } },
      stack: ['<module>', 'add'],
    };
    const sReturn = reduceSceneState(sCall, returnEvt);
    expect(sReturn.character.action).toBe('celebrate');
    expect(sReturn.genericModel.callStack[1]?.returnValue).toBe('5');
    expect(sReturn.statusMessageTh).toContain('คืนค่า 5');

    // Return back to caller frame
    const afterCallEvt: TraceEvent = {
      seq: 3,
      kind: 'line',
      line: 5,
      locals: { res: { type: 'int', value: '5' } },
      stack: ['<module>'],
    };
    const sAfter = reduceSceneState(sReturn, afterCallEvt);
    expect(sAfter.callStackDepth).toBe(1);
    expect(sAfter.genericModel.variables[0]?.name).toBe('res');
    expect(sAfter.genericModel.variables[0]?.value).toBe('5');
  });

  it('4. Safe collections and opaque class objects: parsed cleanly without eval', () => {
    const listEvt: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 2,
      locals: {
        numbers: { type: 'list', value: '[10, 20, 30]' },
        config: { type: 'dict', value: "{'debug': True, 'timeout': 60}" },
        user: { type: 'User', value: '<User object at 0x7f9a1234abcd>' },
        add_fn: { type: 'function', value: '<function calculate at 0x7f9a5678ef01>' },
      },
    };

    const state = reduceSceneState(INITIAL_SCENE_STATE, listEvt);
    const vars = state.genericModel.variables;

    const listVar = vars.find((v) => v.name === 'numbers');
    expect(listVar?.parsed.isContainer).toBe(true);
    expect(listVar?.parsed.containerType).toBe('list');
    expect(listVar?.parsed.elements).toHaveLength(3);
    expect(listVar?.parsed.elements[0]?.value).toBe('10');

    const dictVar = vars.find((v) => v.name === 'config');
    expect(dictVar?.parsed.isContainer).toBe(true);
    expect(dictVar?.parsed.containerType).toBe('dict');
    expect(dictVar?.parsed.elements).toHaveLength(2);
    expect(dictVar?.parsed.elements[0]?.key).toBe("'debug'");

    const userVar = vars.find((v) => v.name === 'user');
    expect(userVar?.parsed.containerType).toBe('object');
    expect(userVar?.parsed.preview).toContain('User');

    const fnVar = vars.find((v) => v.name === 'add_fn');
    expect(fnVar?.parsed.containerType).toBe('function');
    expect(fnVar?.parsed.preview).toContain('calculate');
  });

  it('5. Fixed variable budget <= 12 and honest +N omitted indication', () => {
    // Generate 16 variables in locals
    const locals: Record<string, { type: string; value: string }> = {};
    for (let i = 1; i <= 16; i++) {
      locals[`var_${i}`] = { type: 'int', value: `${i * 10}` };
    }

    const state = reduceSceneState(INITIAL_SCENE_STATE, {
      seq: 1,
      kind: 'line',
      line: 10,
      locals,
    });

    expect(state.genericModel.variables.length).toBeLessThanOrEqual(MAX_DISPLAY_VARIABLES);
    expect(state.genericModel.variables).toHaveLength(12);
    expect(state.genericModel.omittedCount).toBe(4);
    expect(state.genericModel.totalVariablesCount).toBe(16);
  });

  it('6. Runtime and syntax errors: clear visual status without fabricated output', () => {
    const excEvt: TraceEvent = {
      seq: 4,
      kind: 'exception',
      line: 3,
      text: 'ZeroDivisionError: division by zero',
      locals: { x: { type: 'int', value: '42' } },
    };

    const state = reduceSceneState(INITIAL_SCENE_STATE, excEvt);
    expect(state.genericModel.hasException).toBe(true);
    expect(state.genericModel.exceptionMessage).toBe('ZeroDivisionError: division by zero');
    expect(state.statusMessageTh).toContain('ข้อผิดพลาด: ZeroDivisionError: division by zero');
  });

  it('7. Generic despite idle world snapshots: idle world snapshot alone does NOT activate world mode', () => {
    // Arbitrary python code running while tracer holds idle world snapshot
    const idleWorldEvt: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 1,
      world: { x: 0, y: 0, direction: 0, action: 'idle' },
      locals: { greeting: { type: 'str', value: "'Hello World'" } },
    };

    const state = reduceSceneState(INITIAL_SCENE_STATE, idleWorldEvt);

    // MUST remain in generic mode!
    expect(state.isWorldMode).toBe(false);
    expect(state.hasSeenWorldAction).toBe(false);
    expect(state.genericModel.variables[0]?.name).toBe('greeting');

    // Only actual non-idle action enters world mode
    const activeLessonEvt: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 2,
      world: { x: 1, y: 0, direction: 0, action: 'move_forward' },
    };
    const worldState = reduceSceneState(state, activeLessonEvt);
    expect(worldState.isWorldMode).toBe(true);
    expect(worldState.hasSeenWorldAction).toBe(true);
  });

  it('8. Replay restore: backwards seek reconstructs state idempotently without side-effects', () => {
    // Build state history across 3 steps
    const step1: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 1,
      locals: { a: { type: 'int', value: '100' } },
    };
    const state1 = reduceSceneState(INITIAL_SCENE_STATE, step1);

    const step2: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 2,
      locals: { a: { type: 'int', value: '100' }, b: { type: 'int', value: '200' } },
    };
    const state2 = reduceSceneState(state1, step2);
    expect(state2.genericModel.variables).toHaveLength(2);

    const step3: TraceEvent = {
      seq: 3,
      kind: 'line',
      line: 3,
      locals: { a: { type: 'int', value: '100' }, b: { type: 'int', value: '200' }, c: { type: 'int', value: '300' } },
    };
    const state3 = reduceSceneState(state2, step3);
    expect(state3.genericModel.variables).toHaveLength(3);

    // Seek backwards directly from step 3 to step 1
    const restoredState1 = reduceSceneState(state3, step1);

    expect(restoredState1.isWorldMode).toBe(false);
    expect(restoredState1.genericModel.variables).toHaveLength(1);
    expect(restoredState1.genericModel.variables[0]?.name).toBe('a');
    expect(restoredState1.genericModel.variables[0]?.value).toBe('100');
    // Future variables b and c must be completely gone
    expect(restoredState1.genericModel.variables.find((v) => v.name === 'b')).toBeUndefined();
    expect(restoredState1.genericModel.variables.find((v) => v.name === 'c')).toBeUndefined();
  });

  it('9. 3D Variable Stage Mesh Controller manages object pool and disposes cleanly', () => {
    const stage = createVariableStage();
    expect(stage.group).toBeDefined();

    const sampleModel = {
      variables: [
        {
          name: 'x',
          type: 'int',
          value: '42',
          rawPreview: '42',
          isChanged: true,
          isNew: true,
          gridIndex: 0,
          parsed: parseSafeValue({ type: 'int', value: '42' }),
        },
      ],
      omittedCount: 2,
      lastChangedVar: 'x',
      loopInfo: { activeLine: 5, iterationCount: 2, isLooping: true },
      callStack: [{ frameName: '<module>', depth: 1, isActive: true }],
      recentStdout: 'result: 42',
      hasException: false,
      exceptionMessage: null,
      branchInfo: null,
      totalVariablesCount: 3,
    };

    // Update with reducedMotion = false
    stage.update(sampleModel, 0.016, false);
    const pos0 = stage.getVariablePosition(0);
    expect(pos0.x).toBeDefined();
    expect(pos0.z).toBeDefined();

    // Update with reducedMotion = true
    stage.update(sampleModel, 0.016, true);

    // Clean disposal of all Three.js resources
    stage.dispose();
  });

  it('10. Character controller handles customWorldPos and distinct actions cleanly', () => {
    const character = createCharacterMesh();

    // Target a custom coordinate on the variable stage
    character.update(0, 0, 0, 'walk', 0.016, false, { x: 1.5, z: 2.0, rotY: 0 });
    expect(character.group.position.x).toBeDefined();

    // Cast action for function calls
    character.update(0, 0, 0, 'cast', 0.016, false);

    // Celebrate action for returns
    character.update(0, 0, 0, 'celebrate', 0.016, false);

    // Reduced motion instant snapping
    character.update(0, 0, 0, 'study', 0.016, true, { x: -2.0, z: 1.0 });
    expect(character.group.position.x).toBeCloseTo(-2.0);
    expect(character.group.position.z).toBeCloseTo(1.0);

    character.dispose();
  });

  it('11. IsometricWorldScene renders accessible DOM overlay and fallback view for generic code', () => {
    const state: SceneState = {
      ...INITIAL_SCENE_STATE,
      isWorldMode: false,
      genericModel: {
        variables: [
          {
            name: 'count',
            type: 'int',
            value: '5',
            rawPreview: '5',
            isChanged: true,
            isNew: false,
            gridIndex: 0,
            parsed: parseSafeValue({ type: 'int', value: '5' }),
          },
        ],
        omittedCount: 0,
        lastChangedVar: 'count',
        loopInfo: null,
        callStack: [{ frameName: '<main>', depth: 1, isActive: true }],
        recentStdout: null,
        hasException: false,
        exceptionMessage: null,
        branchInfo: null,
        totalVariablesCount: 1,
      },
      statusMessageTh: 'ประมวลผลตัวแปร 1 ตัวแปร • สแตกความลึก 1',
    };

    const html = renderToString(
      React.createElement(IsometricWorldScene, {
        sceneState: state,
      })
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('count');
    expect(html).toContain('5');
    expect(html).toContain('ประมวลผลตัวแปร 1 ตัวแปร • สแตกความลึก 1');
  });
});
