import type { VariableBox } from './sceneReducer';
import type { TraceEvent } from '../runtime/types';

export interface FlowNodeInfo {
  value: string;
  type?: string;
  labelTh: string;
  isNegative: boolean;
  isFloat: boolean;
}

export interface VariableFlowItem {
  varName: string;
  varType: string;
  isNew: boolean;
  hasPrev: boolean;
  previousValue?: string;
  newValue: string;
  prevNode?: FlowNodeInfo;
  newNode: FlowNodeInfo;
  destNode: {
    varName: string;
    varType: string;
    labelTh: string;
  };
}

export interface FlowExplanationState {
  hasChanges: boolean;
  items: VariableFlowItem[];
  effectiveLine: number;
  sourceLineText: string;
  statusLabelTh: string;
}

/**
 * ดึงข้อความบรรทัดโค้ดอย่างสัตย์ซื่อจาก snapshot โดยไม่แต่งเติมการคำนวณ
 */
export function extractSourceLineText(sourceSnapshot?: string, line?: number): string {
  if (!sourceSnapshot || !line || line < 1) return '';
  const lines = sourceSnapshot.split('\n');
  if (line <= lines.length) {
    return lines[line - 1]?.trim() ?? '';
  }
  return '';
}

/**
 * คำนวณข้อมูลโฟลว์ลูกศรสำหรับอธิบายการเปลี่ยนแปลงค่าตัวแปร 3 ขั้นตอน
 * - ตัวแปรเดิม: ค่าเดิมที่สังเกตได้ -> ค่าใหม่ที่สังเกตได้ -> ตัวแปรเป้าหมาย
 * - ตัวแปรใหม่: ค่าใหม่ที่สังเกตได้ -> ตัวแปรเป้าหมาย (ไม่อุปโลกน์เลข 0 ก่อนหน้า)
 * - ไม่มีการเปลี่ยนแปลง: แสดงสถานะปัจจุบันอย่างสัตย์ซื่อ ไม่สร้างลูกศรหลอก
 */
export function computeFlowExplanation(
  variables: VariableBox[],
  currentEvent?: TraceEvent | null,
  sourceSnapshot?: string,
  activeLine?: number
): FlowExplanationState {
  const effectiveLine = activeLine ?? currentEvent?.line ?? 0;
  const sourceLineText = extractSourceLineText(sourceSnapshot, effectiveLine);

  // เหตุการณ์ stdout ต้องไม่ถูกตีความว่าเป็นการเปลี่ยนค่าตัวแปร
  if (currentEvent?.kind === 'stdout') {
    return {
      hasChanges: false,
      items: [],
      effectiveLine,
      sourceLineText,
      statusLabelTh: currentEvent.text
        ? `พิมพ์ออกคอนโซล: "${currentEvent.text.trim()}" (สถานะตัวแปรคงเดิม)`
        : 'พิมพ์ข้อความออกคอนโซล (ไม่มีการเปลี่ยนแปลงค่าตัวแปร)',
    };
  }

  // หาตัวแปรที่มีการเปลี่ยนแปลง โดยจำกัดงบประมาณไม่เกิน 12 ตัวแปร
  const changedVars = variables.filter((v) => v.isChanged).slice(0, 12);

  if (changedVars.length === 0) {
    return {
      hasChanges: false,
      items: [],
      effectiveLine,
      sourceLineText,
      statusLabelTh:
        effectiveLine > 0
          ? `บรรทัดที่ ${effectiveLine}: ค่าที่สังเกตได้คงเดิมเมื่อเทียบกับ snapshot ก่อนหน้า (ไม่ได้ยืนยันว่าไม่มีการเขียนค่า)`
          : 'พร้อมแสดงผลลำดับการเปลี่ยนแปลงค่าตัวแปร',
    };
  }

  const items: VariableFlowItem[] = changedVars.map((v) => {
    const isNew = v.isNew;
    const hasPrev = !isNew && v.previousValue !== undefined && v.previousValue !== v.value;
    const isValNegative = v.value.trim().startsWith('-');
    const isValFloat = v.type === 'float' || v.value.includes('.');

    let prevNode: FlowNodeInfo | undefined = undefined;
    if (hasPrev && v.previousValue !== undefined) {
      prevNode = {
        value: v.previousValue,
        labelTh: 'ค่าเดิมก่อนหน้า',
        isNegative: v.previousValue.trim().startsWith('-'),
        isFloat: v.previousValue.includes('.'),
      };
    }

    const newNode: FlowNodeInfo = {
      value: v.value,
      type: v.type,
      labelTh: hasPrev ? 'ค่าใหม่ที่เปลี่ยนแปลง' : 'ตรวจพบค่าใหม่',
      isNegative: isValNegative,
      isFloat: isValFloat,
    };

    const destNode = {
      varName: v.name,
      varType: v.type,
      labelTh: `ตัวแปร ${v.name}`,
    };

    return {
      varName: v.name,
      varType: v.type,
      isNew,
      hasPrev,
      previousValue: hasPrev ? v.previousValue : undefined,
      newValue: v.value,
      prevNode,
      newNode,
      destNode,
    };
  });

  const first = items[0];
  let statusLabelTh = '';
  if (items.length === 1 && first) {
    if (first.hasPrev) {
      statusLabelTh = `ตัวแปร ${first.varName}: ${first.previousValue} ➔ ${first.newValue}`;
    } else {
      statusLabelTh = `สร้างตัวแปร ${first.varName} = ${first.newValue}`;
    }
  } else {
    statusLabelTh = `ตรวจพบการเปลี่ยนแปลง ${items.length} ตัวแปรพร้อมกัน`;
  }

  return {
    hasChanges: true,
    items,
    effectiveLine,
    sourceLineText,
    statusLabelTh,
  };
}

/**
 * สร้างคำอธิบายภาษาไทยสำหรับ 3 ขั้นตอน (3 Phases) ของโฟลว์ลูกศร
 */
export function getPhaseDescriptionTh(
  item: VariableFlowItem | undefined,
  phase: 1 | 2 | 3
): string {
  if (!item) {
    return 'สถานะปัจจุบันคงที่ (ไม่มีการส่งต่อค่า)';
  }

  if (item.hasPrev) {
    switch (phase) {
      case 1:
        return `ขั้นที่ 1/3: สังเกตค่าเดิม [${item.previousValue}] ของตัวแปร ${item.varName}`;
      case 2:
        return `ขั้นที่ 2/3: เกิดการเปลี่ยนแปลงสู่ค่าใหม่ [${item.newValue}]`;
      case 3:
        return `ขั้นที่ 3/3: ลูกศรนำค่าใหม่ [${item.newValue}] บันทึกลงตัวแปร [${item.varName}] สำเร็จ`;
    }
  } else {
    switch (phase) {
      case 1:
        return `ขั้นที่ 1/3: สังเกตค่าใหม่ [${item.newValue}] ที่ตรวจพบในคำสั่ง`;
      case 2:
        return `ขั้นที่ 2/3: ลูกศรเตรียมนำค่า [${item.newValue}] บันทึกลงตัวแปร [${item.varName}]`;
      case 3:
        return `ขั้นที่ 3/3: สร้างตัวแปร [${item.varName} = ${item.newValue}] ในหน่วยความจำสำเร็จ`;
    }
  }
}
