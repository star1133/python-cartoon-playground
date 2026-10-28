import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  reduceSceneState,
  reduceSceneStateHistory,
  INITIAL_SCENE_STATE,
  type SceneState,
  type VariableBox,
} from '../src/scene/sceneReducer';
import {
  computeFlowExplanation,
  getPhaseDescriptionTh,
  extractSourceLineText,
} from '../src/scene/flowExplanationModel';
import { NumberBoard2D } from '../src/scene/NumberBoard2D';
import { AdaptiveExecutionScene } from '../src/scene/AdaptiveExecutionScene';
import type { TraceEvent } from '../src/runtime/types';

describe('Arrow-Guided Step-by-Step Flow Explanation (TDD Evidence Tests)', () => {
  // --------------------------------------------------------------------------
  // 1. Model Tests: computeFlowExplanation & getPhaseDescriptionTh
  // --------------------------------------------------------------------------
  describe('Flow Explanation Model (computeFlowExplanation)', () => {
    it('1.1 correctly identifies observed previous value -> new value -> destination for updated variable', () => {
      const vars: VariableBox[] = [
        {
          name: 'count',
          type: 'int',
          value: '25',
          rawPreview: '25',
          isChanged: true,
          isNew: false,
          previousValue: '10',
          gridIndex: 0,
          parsed: { type: 'int', preview: '25', isTruncated: false, rawValue: '25' },
        },
      ];

      const flow = computeFlowExplanation(vars, { seq: 2, kind: 'line', line: 5 }, 'count = count + 15', 5);

      expect(flow.hasChanges).toBe(true);
      expect(flow.items).toHaveLength(1);

      const item = flow.items[0];
      expect(item.varName).toBe('count');
      expect(item.hasPrev).toBe(true);
      expect(item.isNew).toBe(false);
      expect(item.previousValue).toBe('10');
      expect(item.newValue).toBe('25');
      expect(item.prevNode?.value).toBe('10');
      expect(item.prevNode?.labelTh).toBe('ค่าเดิมก่อนหน้า');
      expect(item.newNode.value).toBe('25');
      expect(item.destNode.varName).toBe('count');
    });

    it('1.2 handles new variable with new value -> destination and DOES NOT invent fake prior zero', () => {
      const vars: VariableBox[] = [
        {
          name: 'total',
          type: 'int',
          value: '0', // New variable initialized to 0
          rawPreview: '0',
          isChanged: true,
          isNew: true,
          previousValue: undefined, // Must be undefined, NOT fake zero
          gridIndex: 0,
          parsed: { type: 'int', preview: '0', isTruncated: false, rawValue: '0' },
        },
      ];

      const flow = computeFlowExplanation(vars, { seq: 1, kind: 'line', line: 1 }, 'total = 0', 1);

      expect(flow.hasChanges).toBe(true);
      expect(flow.items).toHaveLength(1);

      const item = flow.items[0];
      expect(item.varName).toBe('total');
      expect(item.isNew).toBe(true);
      expect(item.hasPrev).toBe(false);
      expect(item.previousValue).toBeUndefined();
      expect(item.prevNode).toBeUndefined(); // Crucial: NO fake prior node!
      expect(item.newValue).toBe('0');
      expect(item.newNode.value).toBe('0');
      expect(item.destNode.varName).toBe('total');
    });

    it('1.3 accurately preserves numbers: zero, negative integers, floats, and negative floats', () => {
      const testCases: Array<{ val: string; type: string; isNeg: boolean; isFloat: boolean }> = [
        { val: '0', type: 'int', isNeg: false, isFloat: false },
        { val: '0.0', type: 'float', isNeg: false, isFloat: true },
        { val: '-42', type: 'int', isNeg: true, isFloat: false },
        { val: '3.14159', type: 'float', isNeg: false, isFloat: true },
        { val: '-0.75', type: 'float', isNeg: true, isFloat: true },
      ];

      for (const tc of testCases) {
        const vars: VariableBox[] = [
          {
            name: 'v',
            type: tc.type,
            value: tc.val,
            rawPreview: tc.val,
            isChanged: true,
            isNew: false,
            previousValue: '100',
            gridIndex: 0,
            parsed: { type: tc.type, preview: tc.val, isTruncated: false, rawValue: tc.val },
          },
        ];

        const flow = computeFlowExplanation(vars, { seq: 1, kind: 'line', line: 2 });
        const item = flow.items[0];
        expect(item.newNode.value).toBe(tc.val);
        expect(item.newNode.isNegative).toBe(tc.isNeg);
        expect(item.newNode.isFloat).toBe(tc.isFloat);
      }
    });

    it('1.4 faithfully handles multiple changed variables bounded by 12', () => {
      const vars: VariableBox[] = [];
      for (let i = 1; i <= 15; i++) {
        vars.push({
          name: `var_${i}`,
          type: 'int',
          value: `${i * 10}`,
          rawPreview: `${i * 10}`,
          isChanged: true,
          isNew: true,
          gridIndex: i - 1,
          parsed: { type: 'int', preview: `${i * 10}`, isTruncated: false, rawValue: `${i * 10}` },
        });
      }

      const flow = computeFlowExplanation(vars, { seq: 1, kind: 'line', line: 1 });
      expect(flow.hasChanges).toBe(true);
      // Must be capped at bounded 12
      expect(flow.items.length).toBe(12);
      expect(flow.items[0]?.varName).toBe('var_1');
      expect(flow.items[11]?.varName).toBe('var_12');
    });

    it('1.5 ensures no change event produces hasChanges=false with no fake transfer', () => {
      const vars: VariableBox[] = [
        {
          name: 'x',
          type: 'int',
          value: '10',
          rawPreview: '10',
          isChanged: false, // Not changed
          isNew: false,
          previousValue: '10',
          gridIndex: 0,
          parsed: { type: 'int', preview: '10', isTruncated: false, rawValue: '10' },
        },
      ];

      const flow = computeFlowExplanation(vars, { seq: 3, kind: 'line', line: 4 }, 'print(x)', 4);
      expect(flow.hasChanges).toBe(false);
      expect(flow.items).toHaveLength(0);
      expect(flow.statusLabelTh).toContain('คงเดิม');
    });

    it('1.6 ensures stdout event NEVER falsely interprets output as variable changes', () => {
      const vars: VariableBox[] = [
        {
          name: 'x',
          type: 'int',
          value: '10',
          rawPreview: '10',
          isChanged: true, // Suppose a dirty flag slipped in
          isNew: false,
          gridIndex: 0,
          parsed: { type: 'int', preview: '10', isTruncated: false, rawValue: '10' },
        },
      ];

      const flow = computeFlowExplanation(
        vars,
        { seq: 4, kind: 'stdout', line: 4, text: 'Hello World\n' },
        'print("Hello World")',
        4
      );

      expect(flow.hasChanges).toBe(false);
      expect(flow.items).toHaveLength(0);
      expect(flow.statusLabelTh).toContain('พิมพ์ออกคอนโซล');
      expect(flow.statusLabelTh).toContain('Hello World');
    });

    it('1.7 generates clear Thai descriptions for all 3 phases (existing & new)', () => {
      // Existing update
      const existingItem = computeFlowExplanation([
        {
          name: 'total',
          type: 'int',
          value: '50',
          rawPreview: '50',
          isChanged: true,
          isNew: false,
          previousValue: '20',
          gridIndex: 0,
          parsed: { type: 'int', preview: '50', isTruncated: false, rawValue: '50' },
        },
      ]).items[0];

      expect(getPhaseDescriptionTh(existingItem, 1)).toContain('ขั้นที่ 1/3');
      expect(getPhaseDescriptionTh(existingItem, 1)).toContain('ค่าเดิม [20]');

      expect(getPhaseDescriptionTh(existingItem, 2)).toContain('ขั้นที่ 2/3');
      expect(getPhaseDescriptionTh(existingItem, 2)).toContain('ค่าใหม่ [50]');

      expect(getPhaseDescriptionTh(existingItem, 3)).toContain('ขั้นที่ 3/3');
      expect(getPhaseDescriptionTh(existingItem, 3)).toContain('บันทึกลงตัวแปร [total]');

      // New variable
      const newItem = computeFlowExplanation([
        {
          name: 'flag',
          type: 'bool',
          value: 'True',
          rawPreview: 'True',
          isChanged: true,
          isNew: true,
          gridIndex: 0,
          parsed: { type: 'bool', preview: 'True', isTruncated: false, rawValue: 'True' },
        },
      ]).items[0];

      expect(getPhaseDescriptionTh(newItem, 1)).toContain('ขั้นที่ 1/3');
      expect(getPhaseDescriptionTh(newItem, 1)).toContain('ตรวจพบ');

      expect(getPhaseDescriptionTh(newItem, 2)).toContain('ขั้นที่ 2/3');
      expect(getPhaseDescriptionTh(newItem, 2)).toContain('ลูกศร');

      expect(getPhaseDescriptionTh(newItem, 3)).toContain('ขั้นที่ 3/3');
      expect(getPhaseDescriptionTh(newItem, 3)).toContain('สร้างตัวแปร');
    });
  });

  // --------------------------------------------------------------------------
  // 2. UI Component Tests: NumberBoard2D with 3 Phases & SVG Arrows
  // --------------------------------------------------------------------------
  describe('NumberBoard2D Flow Rendering and 3 Phases', () => {
    function buildStateWithChange(
      prevVal: string | undefined,
      newVal: string,
      varName: string = 'count'
    ): SceneState {
      const isNew = prevVal === undefined;
      return {
        ...INITIAL_SCENE_STATE,
        genericModel: {
          ...INITIAL_SCENE_STATE.genericModel,
          variables: [
            {
              name: varName,
              type: 'int',
              value: newVal,
              rawPreview: newVal,
              isChanged: true,
              isNew,
              previousValue: prevVal,
              gridIndex: 0,
              parsed: { type: 'int', preview: newVal, isTruncated: false, rawValue: newVal },
            },
          ],
          totalVariablesCount: 1,
        },
      };
    }

    it('2.1 Phase 1: Highlights observed previous value, arrows remain inactive', () => {
      const state = buildStateWithChange('10', '25', 'count');
      const html = renderToString(
        React.createElement(NumberBoard2D, {
          sceneState: state,
          initialPhase: 1,
          isPlaying: false,
        })
      );

      // Section exists
      expect(html).toContain('data-testid="flow-explanation"');
      // Navigation buttons
      expect(html).toContain('data-testid="phase-prev"');
      expect(html).toContain('data-testid="phase-next"');
      expect(html).toContain('disabled=""'); // Prev button must be disabled at phase 1

      // 3 Phase pills
      expect(html).toContain('data-testid="flow-phase-1"');
      expect(html).toContain('data-testid="flow-phase-2"');
      expect(html).toContain('data-testid="flow-phase-3"');
      expect(html).toContain('nb2d-phase-pill-active');

      // Phase indicator banner
      expect(html).toContain('data-testid="phase-indicator"');
      expect(html).toContain('ขั้นที่ 1/3');
      expect(html).toContain('ค่าเดิม [10]');

      // Nodes & Arrows
      expect(html).toContain('data-testid="flow-node-prev"');
      expect(html).toContain('nb2d-node-highlighted'); // Prev node highlighted
      expect(html).toContain('10');

      // Arrows inactive at phase 1
      expect(html).toContain('data-testid="flow-arrow-1"');
      expect(html).toContain('data-testid="flow-arrow-2"');
      expect(html).toContain('nb2d-arrow-inactive');
    });

    it('2.2 Phase 2: Arrow 1 reveals, highlights observed new value', () => {
      const state = buildStateWithChange('10', '25', 'count');
      const html = renderToString(
        React.createElement(NumberBoard2D, {
          sceneState: state,
          initialPhase: 2,
          isPlaying: false,
        })
      );

      expect(html).toContain('ขั้นที่ 2/3');
      expect(html).toContain('data-testid="flow-arrow-1"');
      // Arrow 1 is now ACTIVE
      expect(html).toMatch(/data-testid="flow-arrow-1"[^>]*class="[^"]*nb2d-arrow-active/);

      // New value node is highlighted
      expect(html).toMatch(/data-testid="flow-node-new"[^>]*class="[^"]*nb2d-node-highlighted/);
      expect(html).toContain('25');

      // Arrow 2 is still INACTIVE
      expect(html).toMatch(/data-testid="flow-arrow-2"[^>]*class="[^"]*nb2d-arrow-inactive/);
    });

    it('2.3 Phase 3: Arrow 2 reveals, destination variable node is stored/active', () => {
      const state = buildStateWithChange('10', '25', 'count');
      const html = renderToString(
        React.createElement(NumberBoard2D, {
          sceneState: state,
          initialPhase: 3,
          isPlaying: false,
        })
      );

      expect(html).toContain('ขั้นที่ 3/3');
      // Both arrows are active
      expect(html).toMatch(/data-testid="flow-arrow-1"[^>]*class="[^"]*nb2d-arrow-active/);
      expect(html).toMatch(/data-testid="flow-arrow-2"[^>]*class="[^"]*nb2d-arrow-active/);

      // Destination variable node is stored and highlighted
      expect(html).toContain('data-testid="flow-node-dest"');
      expect(html).toContain('nb2d-node-stored');
      expect(html).toContain('count');
      expect(html).toContain('= 25');

      // Next button disabled at phase 3
      expect(html).toMatch(/data-testid="phase-next"[^>]*disabled=""/);
    });

    it('2.4 New variable: Renders new value -> destination WITHOUT fake prior zero', () => {
      const state = buildStateWithChange(undefined, '42', 'answer');
      const html = renderToString(
        React.createElement(NumberBoard2D, {
          sceneState: state,
          initialPhase: 2,
          isPlaying: false,
        })
      );

      // Absolutely NO prior node for new variable
      expect(html).not.toContain('data-testid="flow-node-prev"');
      // New value node is rendered directly
      expect(html).toContain('data-testid="flow-node-new"');
      expect(html).toContain('42');

      // Destination variable node rendered
      expect(html).toContain('data-testid="flow-node-dest"');
      expect(html).toContain('answer');

      // Phase indicator reflects new variable phrasing
      expect(html).toContain('ขั้นที่ 2/3');
      expect(html).toContain('answer');
    });

    it('2.5 No Change Event: Renders flow-no-change banner with honest state and NO fake arrows', () => {
      const state: SceneState = {
        ...INITIAL_SCENE_STATE,
        genericModel: {
          ...INITIAL_SCENE_STATE.genericModel,
          variables: [
            {
              name: 'x',
              type: 'int',
              value: '100',
              rawPreview: '100',
              isChanged: false,
              isNew: false,
              previousValue: '100',
              gridIndex: 0,
              parsed: { type: 'int', preview: '100', isTruncated: false, rawValue: '100' },
            },
          ],
        },
      };

      const html = renderToString(
        React.createElement(NumberBoard2D, {
          sceneState: state,
          activeLine: 5,
          sourceSnapshot: 'x = 100\nprint(x)',
        })
      );

      // Must render no-change banner
      expect(html).toContain('data-testid="flow-no-change"');
      expect(html).toContain('ยังเป็นค่าเดิม');
      expect(html).toContain('nb2d-stable-number');

      // Must NOT render transfer nodes or arrows
      expect(html).not.toContain('data-testid="flow-node-prev"');
      expect(html).not.toContain('data-testid="flow-arrow-1"');
      expect(html).not.toContain('data-testid="flow-arrow-2"');
    });

    it('2.6 Playing state: buttons disabled so user is not interrupted during auto playback', () => {
      const state = buildStateWithChange('10', '25', 'count');
      const html = renderToString(
        React.createElement(NumberBoard2D, {
          sceneState: state,
          isPlaying: true, // Playing!
          initialPhase: 2,
        })
      );

      // Both prev and next buttons must have disabled="" attribute during auto playback
      expect(html).toMatch(/data-testid="phase-prev"[^>]*disabled=""/);
      expect(html).toMatch(/data-testid="phase-next"[^>]*disabled=""/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. AdaptiveExecutionScene & Integration Tests
  // --------------------------------------------------------------------------
  describe('AdaptiveExecutionScene & Playback Pacing Integration', () => {
    it('3.1 passes isPlaying and speed props through AdaptiveExecutionScene to NumberBoard2D', () => {
      const state: SceneState = {
        ...INITIAL_SCENE_STATE,
        isWorldMode: false,
        genericModel: {
          ...INITIAL_SCENE_STATE.genericModel,
          variables: [
            {
              name: 'speed_test',
              type: 'int',
              value: '99',
              rawPreview: '99',
              isChanged: true,
              isNew: true,
              gridIndex: 0,
              parsed: { type: 'int', preview: '99', isTruncated: false, rawValue: '99' },
            },
          ],
        },
      };

      const html = renderToString(
        React.createElement(AdaptiveExecutionScene, {
          sceneState: state,
          isPlaying: true,
          speed: 2,
          initialPhase: 2,
        })
      );

      expect(html).toContain('number-board-2d');
      expect(html).toContain('data-testid="flow-explanation"');
      expect(html).toContain('speed_test');
      expect(html).toContain('99');
    });

    it('3.2 preserves IsometricWorldScene when actual world action occurs', () => {
      const worldEvent: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        world: { x: 1, y: 0, direction: 0, action: 'move_forward' },
      };
      const worldState = reduceSceneState(INITIAL_SCENE_STATE, worldEvent);
      expect(worldState.isWorldMode).toBe(true);

      const html = renderToString(
        React.createElement(AdaptiveExecutionScene, {
          sceneState: worldState,
          isPlaying: false,
        })
      );

      // Must be 3D world scene, NOT 2D NumberBoard
      expect(html).toContain('scene-canvas-container');
      expect(html).not.toContain('number-board-2d');
      expect(html).not.toContain('data-testid="flow-explanation"');
    });

    it('3.3 deterministic history computation works cleanly with reduceSceneStateHistory', () => {
      const events: TraceEvent[] = [
        {
          seq: 1,
          kind: 'line',
          line: 1,
          locals: { val: { type: 'int', value: '10' } },
        },
        {
          seq: 2,
          kind: 'line',
          line: 2,
          locals: { val: { type: 'int', value: '25' } },
        },
        {
          seq: 3,
          kind: 'stdout',
          line: 3,
          text: '25\n',
        },
      ];

      // At step 2 (index 1): val changed from 10 to 25
      const state2 = reduceSceneStateHistory(events, 1);
      const v2 = state2.genericModel.variables.find((v) => v.name === 'val');
      expect(v2?.value).toBe('25');
      expect(v2?.previousValue).toBe('10');
      expect(v2?.isChanged).toBe(true);

      // At step 3 (index 2): stdout event -> NO false variable changes
      const state3 = reduceSceneStateHistory(events, 2);
      const v3 = state3.genericModel.variables.find((v) => v.name === 'val');
      expect(v3?.value).toBe('25');
      expect(v3?.isChanged).toBe(false); // stdout does not mutate
      expect(state3.genericModel.lastChangedVar).toBeNull();

      // Backwards seek to step 1 (index 0): val is 10, no previousValue
      const state1 = reduceSceneStateHistory(events, 0);
      const v1 = state1.genericModel.variables.find((v) => v.name === 'val');
      expect(v1?.value).toBe('10');
      expect(v1?.previousValue).toBeUndefined();
      expect(v1?.isNew).toBe(true);
    });
  });
});
