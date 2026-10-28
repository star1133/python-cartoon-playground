import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  reduceSceneState,
  INITIAL_SCENE_STATE,
  createDefaultTiles,
  type SceneState,
} from '../src/scene/sceneReducer';
import { createCharacterMesh } from '../src/scene/characterMesh';
import { createChestMesh } from '../src/scene/chestMesh';
import { createWorldTiles } from '../src/scene/pathTiles';
import { IsometricWorldScene } from '../src/scene/IsometricWorldScene';
import type { TraceEvent } from '../src/runtime/types';

describe('sceneReducer', () => {
  it('initializes default tiles with path and target', () => {
    const tiles = createDefaultTiles(4, 0);
    const targetTile = tiles.find((t) => t.isTarget);
    expect(targetTile).toBeDefined();
    expect(targetTile?.x).toBe(4);
    expect(targetTile?.y).toBe(0);
  });

  it('handles world move_forward and marks tiles visited', () => {
    const moveEvent: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 3,
      world: { x: 1, y: 0, direction: 0, action: 'move_forward' },
    };
    const newState = reduceSceneState(INITIAL_SCENE_STATE, moveEvent);

    expect(newState.isWorldMode).toBe(true);
    expect(newState.character.x).toBe(1);
    expect(newState.character.y).toBe(0);
    expect(newState.character.action).toBe('walk');

    const visitedTile = newState.tiles.find((t) => t.x === 1 && t.y === 0);
    expect(visitedTile?.isVisited).toBe(true);
  });

  it('handles turns and changes direction', () => {
    const turnEvent: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 4,
      world: { x: 1, y: 0, direction: 1, action: 'turn_right' },
    };
    const newState = reduceSceneState(INITIAL_SCENE_STATE, turnEvent);
    expect(newState.character.direction).toBe(1);
    expect(newState.character.action).toBe('turn_right');
  });

  it('opens chest and celebrates when character reaches the goal', () => {
    const goalEvent: TraceEvent = {
      seq: 5,
      kind: 'line',
      line: 8,
      world: { x: 4, y: 0, direction: 0, action: 'move_forward' },
    };
    const newState = reduceSceneState(INITIAL_SCENE_STATE, goalEvent);
    expect(newState.chest.isOpen).toBe(true);
    expect(newState.chest.isReached).toBe(true);
    expect(newState.character.action).toBe('celebrate');
    expect(newState.statusMessageTh).toContain('เปิดหีบสมบัติสำเร็จ');
  });

  it('transforms general Python code events into data items and call stack depth', () => {
    const generalEvent: TraceEvent = {
      seq: 10,
      kind: 'call',
      line: 12,
      name: 'calculate_total',
      locals: {
        total: { type: 'int', value: '150' },
        tax: { type: 'float', value: '10.5' },
      },
      stack: ['<module>', 'calculate_total'],
    };
    const newState = reduceSceneState(INITIAL_SCENE_STATE, generalEvent);

    expect(newState.isWorldMode).toBe(false);
    expect(newState.dataItems).toHaveLength(2);
    expect(newState.dataItems[0]?.name).toBe('total');
    expect(newState.dataItems[0]?.value).toBe('150');
    expect(newState.callStackDepth).toBe(2);
    expect(newState.character.action).toBe('cast');
  });

  it('truthfully restores world scene when replaying backwards from absolute snapshot without recomputation', () => {
    // 1. Advance to goal state at x=4
    const goalEvent: TraceEvent = {
      seq: 4,
      kind: 'line',
      line: 7,
      world: { x: 4, y: 0, direction: 0, action: 'move_forward' },
    };
    const stateAtGoal = reduceSceneState(INITIAL_SCENE_STATE, goalEvent);
    expect(stateAtGoal.character.x).toBe(4);
    expect(stateAtGoal.chest.isOpen).toBe(true);
    expect(stateAtGoal.chest.isReached).toBe(true);

    const goalTile = stateAtGoal.tiles.find((t) => t.x === 4 && t.y === 0);
    expect(goalTile?.isVisited).toBe(true);

    // 2. Replay backwards directly to step 2 (x=2, y=0) from goal state
    const backStep2Event: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 4,
      world: { x: 2, y: 0, direction: 0, action: 'move_forward' },
    };
    const stateAtStep2 = reduceSceneState(stateAtGoal, backStep2Event);

    // Position and chest must be restored truthfully from absolute snapshot
    expect(stateAtStep2.character.x).toBe(2);
    expect(stateAtStep2.character.y).toBe(0);
    expect(stateAtStep2.chest.isOpen).toBe(false);
    expect(stateAtStep2.chest.isReached).toBe(false);

    // Tiles up to x=2 are visited; future tiles (3,0) and (4,0) are unvisited
    const tile2 = stateAtStep2.tiles.find((t) => t.x === 2 && t.y === 0);
    const tile3 = stateAtStep2.tiles.find((t) => t.x === 3 && t.y === 0);
    const tile4 = stateAtStep2.tiles.find((t) => t.x === 4 && t.y === 0);
    expect(tile2?.isVisited).toBe(true);
    expect(tile3?.isVisited).toBe(false);
    expect(tile4?.isVisited).toBe(false);

    // 3. Replay backwards directly to start position (x=0, y=0)
    const backStep0Event: TraceEvent = {
      seq: 0,
      kind: 'line',
      line: 1,
      world: { x: 0, y: 0, direction: 0, action: 'idle' },
    };
    const stateAtStep0 = reduceSceneState(stateAtStep2, backStep0Event);
    expect(stateAtStep0.character.x).toBe(0);
    expect(stateAtStep0.character.y).toBe(0);
    expect(stateAtStep0.character.action).toBe('idle');
    expect(stateAtStep0.chest.isOpen).toBe(false);

    const tile0 = stateAtStep0.tiles.find((t) => t.x === 0 && t.y === 0);
    const tile1 = stateAtStep0.tiles.find((t) => t.x === 1 && t.y === 0);
    expect(tile0?.isVisited).toBe(true);
    expect(tile1?.isVisited).toBe(false);
  });

  it('resets world properly on initial or non-world event rather than persisting stale state', () => {
    // Simulate a prior state where character was at (3, 0)
    const priorWorldState: SceneState = {
      ...INITIAL_SCENE_STATE,
      character: {
        x: 3,
        y: 0,
        direction: 1,
        action: 'walk',
        isMoving: true,
      },
      chest: {
        x: 4,
        y: 0,
        isOpen: true,
        isReached: false,
      },
      isWorldMode: true,
    };

    // Receive initial event with no world snapshot
    const initialEventNoWorld: TraceEvent = {
      seq: 0,
      kind: 'line',
      line: 1,
    };

    const resetState = reduceSceneState(priorWorldState, initialEventNoWorld);

    // World state must NOT persist!
    expect(resetState.isWorldMode).toBe(false);
    expect(resetState.character.x).toBe(0);
    expect(resetState.character.y).toBe(0);
    expect(resetState.character.direction).toBe(0);
    expect(resetState.character.isMoving).toBe(false);
    expect(resetState.chest.isOpen).toBe(false);
    expect(resetState.chest.isReached).toBe(false);

    // Passing null resets completely to INITIAL_SCENE_STATE
    const nullReset = reduceSceneState(priorWorldState, null);
    expect(nullReset).toEqual(INITIAL_SCENE_STATE);
  });

  it('does not move actor based on variable names like x, y, move in general python code', () => {
    const arbitraryCodeEvent: TraceEvent = {
      seq: 3,
      kind: 'line',
      line: 5,
      locals: {
        x: { type: 'int', value: '42' },
        y: { type: 'int', value: '10' },
        move: { type: 'str', value: 'forward' },
        direction: { type: 'int', value: '2' },
      },
    };

    const state = reduceSceneState(INITIAL_SCENE_STATE, arbitraryCodeEvent);

    // Actor does NOT move according to variable names
    expect(state.isWorldMode).toBe(false);
    expect(state.character.x).toBe(0);
    expect(state.character.y).toBe(0);
    expect(state.character.direction).toBe(0);

    // Shows data fallback summary with 4 floating items
    expect(state.dataItems).toHaveLength(4);
    expect(state.dataItems.map((d) => d.name)).toEqual(['x', 'y', 'move', 'direction']);
    expect(state.chest.isOpen).toBe(false);
    expect(state.statusMessageTh).toBe('ประมวลผลตัวแปร 4 ตัวแปร • สแตกความลึก 1');
  });
});

describe('3D Scene Controllers & Accessibility', () => {
  it('characterController supports reducedMotion by snapping without hopping', () => {
    const character = createCharacterMesh();
    expect(character.group).toBeDefined();

    // With reducedMotion = true
    character.update(2, 0, 0, 'walk', 0.016, true);

    // Three.js X = 2 * 1.5 = 3.0, Z = 0
    expect(character.group.position.x).toBeCloseTo(3.0);
    expect(character.group.position.z).toBeCloseTo(0);

    // Disposes cleanly
    character.dispose();
  });

  it('chestController supports reducedMotion by snapping lid instantly', () => {
    const chest = createChestMesh();
    chest.setPosition(4, 0);
    expect(chest.group.position.x).toBeCloseTo(6.0); // 4 * 1.5 = 6.0

    // Update with reducedMotion = true and isOpen = true
    chest.update(true, 0.016, true);

    // Disposes cleanly
    chest.dispose();
  });

  it('worldTilesController manages object pool to prevent memory leaks and disposes cleanly', () => {
    const worldTiles = createWorldTiles();
    const defaultTiles = createDefaultTiles(4, 0);

    const dataItemsBatch1 = [
      { name: 'a', type: 'int', value: '1', height: 1.0 },
      { name: 'b', type: 'int', value: '2', height: 1.4 },
    ];
    // First update creates 2 crystal meshes in pool
    worldTiles.update(defaultTiles, dataItemsBatch1, 0.016, false);

    const dataItemsBatch2 = [
      { name: 'a', type: 'int', value: '1', height: 1.0 },
      { name: 'b', type: 'int', value: '2', height: 1.4 },
      { name: 'c', type: 'int', value: '3', height: 1.8 },
      { name: 'd', type: 'int', value: '4', height: 2.2 },
    ];
    // Second update expands pool to 4 without throwing or leaking
    worldTiles.update(defaultTiles, dataItemsBatch2, 0.016, false);

    // Third update reduces count; reuses pool
    worldTiles.update(defaultTiles, [dataItemsBatch2[0]!], 0.016, false);

    // Disposes all resources safely
    worldTiles.dispose();
  });

  it('renders IsometricWorldScene with semantic ARIA live region and Thai status for accessibility', () => {
    const html = renderToString(
      React.createElement(IsometricWorldScene, {
        sceneState: INITIAL_SCENE_STATE,
      })
    );

    // Contains accessible region
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="ฉากจำลองการทำงาน 3 มิติ (3D Isometric Scene)"');

    // Contains live region for screen readers with polite priority
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');

    // Displays initial Thai status
    expect(html).toContain('ตัวละครพร้อมออกสำรวจ');
  });

  it('renders accessible fallback view and live announcements for general data mode', () => {
    const dataState: SceneState = {
      ...INITIAL_SCENE_STATE,
      isWorldMode: false,
      dataItems: [
        { name: 'score', type: 'int', value: '100', height: 1 },
        { name: 'grade', type: 'str', value: 'A', height: 1.4 },
      ],
      callStackDepth: 2,
      statusMessageTh: 'ประมวลผลตัวแปร 2 ตัวแปร • สแตกความลึก 2',
    };

    const html = renderToString(
      React.createElement(IsometricWorldScene, {
        sceneState: dataState,
      })
    );

    // Live region announces variable details
    expect(html).toContain('score = 100');
    expect(html).toContain('grade = A');
    expect(html).toContain('ประมวลผลตัวแปร 2 ตัวแปร • สแตกความลึก 2');

    // WebGL fallback card is present with accessible 2D summary
    expect(html).toContain('โหมดจำลอง 2 มิติ (WebGL Fallback)');
    expect(html).toContain('สถานะข้อมูล');
  });
});
