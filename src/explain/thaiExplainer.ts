import type { TraceEvent } from '../runtime/types';
import { THAI_TEMPLATES } from './templates.th';

/**
 * วิเคราะห์เหตุการณ์ TraceEvent และโค้ดต้นฉบับเพื่อแปลงเป็นคำอธิบายภาษาไทยที่ชัดเจน
 * รับประกัน:
 * 1. เหตุการณ์ก่อนรันบรรทัด (pre-line events) จะใช้ "กำลังจะ..." ไม่กล่าวอ้างว่ากำหนดค่าแล้วก่อนรันจริง
 * 2. การอัปเดตค่าที่เสร็จสมบูรณ์จะแสดงจากผลต่าง (diff) ระหว่าง prevEvent กับ currentEvent เท่านั้น
 */
export function explainTraceEvent(
  event: TraceEvent,
  sourceCode?: string,
  prevEvent?: TraceEvent | null
): string {
  // 1. ถ้ามีคำอธิบายจาก tracer มาอยู่แล้ว และเป็นข้อความที่สมบูรณ์ ให้ใช้คำอธิบายนั้นได้
  if (event.explanation && event.explanation.trim().length > 0) {
    return event.explanation;
  }

  // 2. ถ้าเป็นเหตุการณ์ที่เกี่ยวกับโลกเกม 3D (World Event)
  if (event.world && event.world.action !== 'idle') {
    const { action, x, y, direction } = event.world;
    const dirName = THAI_TEMPLATES.directions[((direction % 4) + 4) % 4] || 'ตะวันออก';

    if (action === 'move_forward') {
      return THAI_TEMPLATES.world.move_forward(x, y);
    }
    if (action === 'turn_left') {
      return THAI_TEMPLATES.world.turn_left(dirName);
    }
    if (action === 'turn_right') {
      return THAI_TEMPLATES.world.turn_right(dirName);
    }
    if (action === 'reach_goal') {
      return THAI_TEMPLATES.world.reach_goal;
    }
    if (action === 'blocked') {
      return THAI_TEMPLATES.world.blocked;
    }
  }

  // 3. ถ้าเป็นเหตุการณ์ call / return / exception / stdout
  if (event.kind === 'call' && event.name) {
    return THAI_TEMPLATES.syntax.call(event.name);
  }
  if (event.kind === 'return' && event.name) {
    return THAI_TEMPLATES.syntax.return(event.name, event.text);
  }
  if (event.kind === 'exception') {
    return THAI_TEMPLATES.syntax.exception(event.text || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ');
  }
  if (event.kind === 'stdout' && event.text) {
    return THAI_TEMPLATES.syntax.print(event.text.trim());
  }

  // 4. ตรวจสอบผลต่าง (Diff) จากเหตุการณ์ก่อนหน้า (ถ้ามี) เพื่อรายงานการกำหนดค่าที่เพิ่งเสร็จสิ้น
  const completedAssigns: string[] = [];
  if (prevEvent && prevEvent.locals && event.locals) {
    for (const [name, curVal] of Object.entries(event.locals)) {
      const prevVal = prevEvent.locals[name];
      if (!prevVal || prevVal.value !== curVal.value) {
        completedAssigns.push(THAI_TEMPLATES.syntax.assign_done(name, curVal.value));
      }
    }
  }

  // 5. วิเคราะห์จากบรรทัดโค้ดใน sourceCode (ถ้ามี) สำหรับ pre-line statement
  let currentActionDesc: string | null = null;
  if (sourceCode && event.line > 0) {
    const lines = sourceCode.split('\n');
    const rawLine = lines[event.line - 1];
    if (rawLine !== undefined) {
      const trimmed = rawLine.trim();

      if (trimmed.startsWith('for ')) {
        const loopMatch = trimmed.match(/^for\s+([a-zA-Z0-9_,\s]+)\s+in\s+(.+):/);
        const loopTarget = loopMatch ? `${loopMatch[1].trim()} จาก ${loopMatch[2].trim()}` : trimmed;
        currentActionDesc = THAI_TEMPLATES.syntax.loop_for(loopTarget);
      } else if (trimmed.startsWith('while ')) {
        currentActionDesc = THAI_TEMPLATES.syntax.loop_while;
      } else if (trimmed.startsWith('if ')) {
        currentActionDesc = THAI_TEMPLATES.syntax.condition_if;
      } else if (trimmed.startsWith('elif ')) {
        currentActionDesc = THAI_TEMPLATES.syntax.condition_elif;
      } else if (trimmed.startsWith('else:')) {
        currentActionDesc = THAI_TEMPLATES.syntax.condition_else;
      } else if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
        currentActionDesc = THAI_TEMPLATES.syntax.import(trimmed);
      } else if (trimmed.startsWith('class ')) {
        const clsMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
        currentActionDesc = THAI_TEMPLATES.syntax.class_def(clsMatch ? clsMatch[1] : trimmed);
      } else if (trimmed.includes('print(')) {
        currentActionDesc = THAI_TEMPLATES.syntax.print();
      } else {
        // ตรวจสอบการกำหนดค่าตัวแปร เช่น x = 10 หรือ count += 1
        const assignMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
        if (assignMatch && !trimmed.startsWith('def ')) {
          const varName = assignMatch[1];
          currentActionDesc = THAI_TEMPLATES.syntax.assign_pre(varName);
        }
      }
    }
  }

  if (!currentActionDesc) {
    currentActionDesc = THAI_TEMPLATES.syntax.generic_line(event.line);
  }

  // รวมข้อความ diff สำเร็จ กับข้อความ pre-line กำลังจะทำ
  if (completedAssigns.length > 0) {
    return `${completedAssigns.join(' • ')} • ${currentActionDesc}`;
  }

  return currentActionDesc;
}
