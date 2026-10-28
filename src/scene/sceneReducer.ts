import type { TraceEvent, Value } from '../runtime/types';
import { parseSafeValue, truncateString, type ParsedValueInfo } from './safeValueParser';

export interface WorldTile {
  x: number;
  y: number;
  isPath: boolean;
  isVisited: boolean;
  isTarget: boolean;
}

export interface FloatingDataItem {
  name: string;
  type: string;
  value: string;
  height: number;
}

export interface VariableBox {
  name: string;
  type: string;
  value: string;
  rawPreview: string;
  isChanged: boolean;
  isNew: boolean;
  previousValue?: string;
  parsed: ParsedValueInfo;
  gridIndex: number;
}

export interface StackStation {
  frameName: string;
  depth: number;
  returnValue?: string;
  isActive: boolean;
}

export interface GenericSceneModel {
  variables: VariableBox[];
  omittedCount: number;
  lastChangedVar: string | null;
  loopInfo: {
    activeLine: number;
    iterationCount: number;
    isLooping: boolean;
  } | null;
  callStack: StackStation[];
  recentStdout: string | null;
  hasException: boolean;
  exceptionMessage: string | null;
  branchInfo: {
    takenLine: number;
    descriptionTh: string;
  } | null;
  totalVariablesCount: number;
}

export interface SceneState {
  character: {
    x: number;
    y: number;
    direction: number; // 0=East, 1=South, 2=West, 3=North
    action: 'idle' | 'walk' | 'turn_left' | 'turn_right' | 'celebrate' | 'study' | 'cast';
    isMoving: boolean;
  };
  chest: {
    x: number;
    y: number;
    isOpen: boolean;
    isReached: boolean;
  };
  tiles: WorldTile[];
  dataItems: FloatingDataItem[];
  callStackDepth: number;
  isWorldMode: boolean; // true ONLY when actual non-idle explicit lesson actions occur
  statusMessageTh: string;
  genericModel: GenericSceneModel;
  hasSeenWorldAction: boolean;
  prevLocals?: Record<string, Value>;
  lineVisitCounts?: Record<number, number>;
  lastLine?: number;
}

export const MAX_DISPLAY_VARIABLES = 12;

/**
 * สร้างตารางกระเบื้องเริ่มต้นสำหรับเส้นทางสู่หีบสมบัติ (Default 5-tile path: (0,0) -> (4,0))
 */
export function createDefaultTiles(targetX = 4, targetY = 0): WorldTile[] {
  const tiles: WorldTile[] = [];
  for (let x = 0; x <= 5; x++) {
    for (let y = -1; y <= 1; y++) {
      const isPath = y === 0 && x <= targetX;
      const isTarget = x === targetX && y === targetY;
      tiles.push({
        x,
        y,
        isPath,
        isVisited: x === 0 && y === 0,
        isTarget,
      });
    }
  }
  return tiles;
}

export const INITIAL_GENERIC_MODEL: GenericSceneModel = {
  variables: [],
  omittedCount: 0,
  lastChangedVar: null,
  loopInfo: null,
  callStack: [{ frameName: '<main>', depth: 1, isActive: true }],
  recentStdout: null,
  hasException: false,
  exceptionMessage: null,
  branchInfo: null,
  totalVariablesCount: 0,
};

export const INITIAL_SCENE_STATE: SceneState = {
  character: {
    x: 0,
    y: 0,
    direction: 0,
    action: 'idle',
    isMoving: false,
  },
  chest: {
    x: 4,
    y: 0,
    isOpen: false,
    isReached: false,
  },
  tiles: createDefaultTiles(4, 0),
  dataItems: [],
  callStackDepth: 1,
  isWorldMode: false, // User code first: standard arbitrary Python is primary!
  statusMessageTh: 'ตัวละครพร้อมออกสำรวจ',
  genericModel: INITIAL_GENERIC_MODEL,
  hasSeenWorldAction: false,
  prevLocals: {},
  lineVisitCounts: {},
};

/**
 * ปรับปรุงสถานะฉาก 3D ตามเหตุการณ์ TraceEvent จาก Python runtime
 * รับประกัน:
 * 1. ฟื้นฟูฉากอย่างสัตย์ซื่อ (truthful idempotent replay) จาก snapshot สัมบูรณ์
 * 2. โค้ด Python ทั่วไป (Arbitrary normal Python) เป็นโหมดหลัก แสดงสถานีกล่องตัวแปร คอลสแตก และลูป
 * 3. ไม่ปฏิบัติต่อ idle world snapshot เป็นโหมดโลก เว้นแต่จะมีการกระทำบทเรียนโลกจริง (action !== 'idle')
 * 4. เมื่อส่ง null จะรีเซ็ตสภาพแวดล้อมใหม่ทั้งหมดอย่างสะอาด
 */
export function reduceSceneState(state: SceneState, event: TraceEvent | null): SceneState {
  if (!event) {
    return INITIAL_SCENE_STATE;
  }

  // ตรวจสอบว่าเป็นเหตุการณ์โลกบทเรียนจริงหรือไม่:
  // กฎ: world snapshot ที่มี action === 'idle' เพียงอย่างเดียวไม่ถือเป็น world mode
  // ต้องมีการกระทำบทเรียนโลกจริง (action !== 'idle') จึงจะเข้าสู่โหมดโลก
  const hasWorldSnapshot = Boolean(event.world);
  const isExplicitWorldAction =
    hasWorldSnapshot && event.world?.action !== undefined && event.world.action !== 'idle';

  // รักษาสถานะโลกไว้เฉพาะกรณีที่เคยมี action โลกจริงในเซสชันนี้ และยังมี snapshot โลกอยู่
  const shouldBeWorldMode = isExplicitWorldAction || (state.isWorldMode && state.hasSeenWorldAction && hasWorldSnapshot);

  // 1. โหมดบทเรียนโลก (World Mode)
  if (shouldBeWorldMode && event.world) {
    const { x, y, direction, action } = event.world;
    const targetX = state.chest?.x ?? 4;
    const targetY = state.chest?.y ?? 0;
    const isReached = x >= targetX && y === targetY;
    const isOpen = isReached || action === 'reach_goal';

    let characterAction: SceneState['character']['action'] = 'walk';
    if (action === 'turn_left') characterAction = 'turn_left';
    else if (action === 'turn_right') characterAction = 'turn_right';
    else if (isReached || action === 'reach_goal') characterAction = 'celebrate';
    else if (action === 'idle') characterAction = 'idle';

    const updatedTiles = createDefaultTiles(targetX, targetY).map((tile) => {
      const isVisited =
        (tile.x === 0 && tile.y === 0) ||
        (tile.y === 0 && y === 0 && tile.x <= x && tile.x >= 0) ||
        (tile.x === x && tile.y === y);
      return {
        ...tile,
        isVisited,
      };
    });

    let statusMessageTh = `ตัวละครอยู่ที่ (${x}, ${y})`;
    if (isReached || action === 'reach_goal') {
      statusMessageTh = 'ยินดีด้วย! ตัวละครเปิดหีบสมบัติสำเร็จ';
    } else if (action === 'turn_left') {
      statusMessageTh = `ตัวละครหันซ้ายอยู่ที่ (${x}, ${y})`;
    } else if (action === 'turn_right') {
      statusMessageTh = `ตัวละครหันขวาอยู่ที่ (${x}, ${y})`;
    } else if (action === 'idle' && x === 0 && y === 0) {
      statusMessageTh = 'ตัวละครพร้อมออกสำรวจ';
    }

    return {
      ...state,
      isWorldMode: true,
      hasSeenWorldAction: true,
      character: {
        x,
        y,
        direction: ((direction % 4) + 4) % 4,
        action: characterAction,
        isMoving: action === 'move_forward',
      },
      chest: {
        x: targetX,
        y: targetY,
        isOpen,
        isReached,
      },
      tiles: updatedTiles,
      dataItems: [],
      callStackDepth: 1,
      statusMessageTh,
    };
  }

  // 2. โหมดโค้ดมาตรฐานทั่วไป (Arbitrary Normal Python Code Visualization)
  // ไม่ขยับตัวละครตามชื่อตัวแปร เช่น x, y, move — สร้าง Generic Scene Model จาก trace event โดยตรง
  const prevLocals = state.prevLocals ?? {};
  const isStdout = event.kind === 'stdout';
  const locals =
    isStdout &&
    (!event.locals || Object.keys(event.locals).length === 0) &&
    Object.keys(prevLocals).length > 0
      ? prevLocals
      : event.locals !== undefined
      ? event.locals
      : prevLocals;
  const localEntries = Object.entries(locals);
  const totalCount = localEntries.length;

  let lastChangedVar: string | null = null;

  // จำกัดงบประมาณตัวแปรสูงสุด 12 ตัวแปรเพื่อรักษาประสิทธิภาพ 60fps และความชัดเจน
  const displayedEntries = localEntries.slice(0, MAX_DISPLAY_VARIABLES);
  const omittedCount = Math.max(0, totalCount - MAX_DISPLAY_VARIABLES);

  const variables: VariableBox[] = displayedEntries.map(([name, val], index) => {
    const parsed = parseSafeValue(val);
    const prevVal = prevLocals[name];
    // ถ้าเป็นเหตุการณ์ stdout ต้องไม่ถือว่าเกิดการเปลี่ยนแปลงตัวแปร (No stdout falsely interpreted changes)
    const isNew = !isStdout && prevVal === undefined;
    const isChanged = !isStdout && (isNew || prevVal.value !== val.value);

    if (isChanged && !lastChangedVar) {
      lastChangedVar = name;
    }

    return {
      name: truncateString(name, 14),
      type: val.type,
      value: val.value,
      rawPreview: parsed.preview,
      isChanged,
      isNew,
      previousValue: prevVal ? prevVal.value : undefined,
      parsed,
      gridIndex: index,
    };
  });

  // Floating data items สำหรับ backward compatibility
  const dataItems: FloatingDataItem[] = displayedEntries.map(([name, val], index) => ({
    name,
    type: val.type,
    value: val.value,
    height: 1 + (index % 4) * 0.4,
  }));

  // คอลสแตก (Call Stack)
  const stackFrames = event.stack && event.stack.length > 0 ? event.stack : ['<main>'];
  const callStackDepth = stackFrames.length;
  const isFunctionCall = event.kind === 'call';
  const isReturn = event.kind === 'return';
  const hasException = event.kind === 'exception';

  const callStack: StackStation[] = stackFrames.map((frame, idx) => ({
    frameName: frame,
    depth: idx + 1,
    isActive: idx === stackFrames.length - 1,
    returnValue: idx === stackFrames.length - 1 && isReturn ? event.text : undefined,
  }));

  // ตรวจจับรอบลูป (Loop Iteration Tracking จากการรันบรรทัดซ้ำใน trace)
  const lineVisitCounts = { ...(state.lineVisitCounts ?? {}) };
  let loopInfo: GenericSceneModel['loopInfo'] = null;

  if (event.kind === 'line' && event.line > 0) {
    const count = (lineVisitCounts[event.line] || 0) + 1;
    lineVisitCounts[event.line] = count;

    if (count > 1) {
      loopInfo = {
        activeLine: event.line,
        iterationCount: count,
        isLooping: true,
      };
    }
  }

  // ตรวจสอบทางเลือกเงื่อนไข (Branch taken) จากบรรทัด trace จริงเท่านั้น (ไม่ re-eval เงื่อนไข)
  let branchInfo: GenericSceneModel['branchInfo'] = null;
  if (event.kind === 'line' && event.line > 0) {
    branchInfo = {
      takenLine: event.line,
      descriptionTh: `ประมวลผลบรรทัดที่ ${event.line}`,
    };
  }

  // ข้อความเอาต์พุตคอนโซล
  let recentStdout: string | null = state.genericModel?.recentStdout ?? null;
  if (event.kind === 'stdout' && event.text) {
    recentStdout = event.text.trim();
  }

  // ข้อมูลข้อผิดพลาด
  const exceptionMessage = hasException ? event.text || 'เกิดข้อผิดพลาดในการประมวลผล' : null;

  // ท่าทางตัวละครตามเหตุการณ์จริง
  let characterAction: SceneState['character']['action'] = 'study';
  if (hasException) {
    characterAction = 'idle';
  } else if (isFunctionCall) {
    characterAction = 'cast';
  } else if (isReturn) {
    characterAction = 'celebrate';
  } else if (lastChangedVar) {
    characterAction = 'walk';
  } else if (loopInfo?.isLooping) {
    characterAction = 'walk';
  } else if (totalCount > 0) {
    characterAction = 'study';
  } else {
    characterAction = 'idle';
  }

  // สร้างข้อความสถานะภาษาไทยที่แม่นยำ
  let statusMessageTh = `ประมวลผลตัวแปร ${totalCount} ตัวแปร • สแตกความลึก ${callStackDepth}`;
  if (hasException) {
    statusMessageTh = `ข้อผิดพลาด: ${exceptionMessage}`;
  } else if (isFunctionCall) {
    statusMessageTh = `เรียกฟังก์ชัน ${event.name || ''}() • สแตกความลึก ${callStackDepth}`;
  } else if (isReturn) {
    statusMessageTh = `ฟังก์ชัน ${event.name || ''}() คืนค่า ${event.text || 'None'}`;
  } else if (event.kind === 'stdout' && recentStdout) {
    statusMessageTh = `พิมพ์ออกคอนโซล: "${recentStdout}"`;
  }

  const genericModel: GenericSceneModel = {
    variables,
    omittedCount,
    lastChangedVar,
    loopInfo,
    callStack,
    recentStdout,
    hasException,
    exceptionMessage,
    branchInfo,
    totalVariablesCount: totalCount,
  };

  return {
    isWorldMode: false,
    hasSeenWorldAction: state.hasSeenWorldAction,
    character: {
      x: 0,
      y: 0,
      direction: 0,
      action: characterAction,
      isMoving: false,
    },
    chest: {
      x: 4,
      y: 0,
      isOpen: false,
      isReached: false,
    },
    tiles: createDefaultTiles(4, 0),
    dataItems,
    callStackDepth,
    statusMessageTh,
    genericModel,
    prevLocals: locals,
    lineVisitCounts,
    lastLine: event.line,
  };
}

/**
 * คำนวณสถานะฉากแบบ Deterministic จากประวัติ TraceEvent ตั้งแต่เริ่มต้นถึง currentIndex
 * ป้องกันปัญหา Stale Replay เมื่อผู้ใช้กรอเส้นเวลาย้อนกลับ (Backwards seek)
 */
export function reduceSceneStateHistory(events: TraceEvent[], currentIndex: number): SceneState {
  if (!events || events.length === 0 || currentIndex < 0) {
    return INITIAL_SCENE_STATE;
  }
  let state = INITIAL_SCENE_STATE;
  const targetIndex = Math.min(currentIndex, events.length - 1);
  for (let i = 0; i <= targetIndex; i++) {
    state = reduceSceneState(state, events[i]);
  }
  return state;
}
