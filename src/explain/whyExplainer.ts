import type { TraceEvent } from '../runtime/types';

/**
 * สร้างคำอธิบายเหตุผลเบื้องหลัง "ทำไม Python ถึงทำแบบนี้"
 * ใช้สำหรับโหมดอธิบายละเอียด — เหมาะสำหรับผู้เรียนที่อยากเข้าใจหลักการ
 * ยึดจากเหตุการณ์ที่บันทึกจริง ไม่สร้างข้อมูลขึ้นเอง
 */
export function explainWhyEvent(
  event: TraceEvent,
  sourceCode?: string,
  prevEvent?: TraceEvent | null
): string | null {
  if (!event) return null;

  // --- return ---
  if (event.kind === 'return' && event.name) {
    const val = event.text ? `"${event.text}"` : 'undefined';
    return `Python ใช้ Call Stack เก็บลำดับการเรียกฟังก์ชัน\nเมื่อ ${event.name}() คืนค่า ${val} — เฟรมถูกนำออกจาก Stack\nตัวแปรภายในฟังก์ชันนั้นหายไปทันที เพราะไม่มีอะไรอ้างอิงถึงมันอีกแล้ว`;
  }

  // --- call ---
  if (event.kind === 'call' && event.name) {
    return `Python สร้างเฟรมใหม่ใน Call Stack สำหรับ ${event.name}()\nตัวแปรภายในฟังก์ชันนี้จะอยู่แยกจากตัวแปรด้านนอก\nเหมือนเปิดกล่องใหม่ — ใส่ของได้ แต่ไม่ปนกับของข้างนอก`;
  }

  // --- exception ---
  if (event.kind === 'exception') {
    return `Python หยุดทำงานทันทีเมื่อเกิด Exception\nแทนที่จะดำเนินต่อด้วยค่าผิด ๆ — Python เลือกหยุดและแจ้งให้รู้\nนี่คือ "fail fast" ซึ่งช่วยให้แก้บั๊กได้ง่ายกว่า`;
  }

  // --- stdout ---
  if (event.kind === 'stdout') {
    return `print() ส่งข้อความไปยัง stdout (คอนโซล)\nข้อมูลที่แสดงมาจากการแปลงค่าเป็น string โดยอัตโนมัติ\nสามารถ print หลายค่าพร้อมกัน โดยใช้ comma คั่น`;
  }

  // --- assignment from source ---
  if (sourceCode && event.line > 0) {
    const lines = sourceCode.split('\n');
    const rawLine = (lines[event.line - 1] ?? '').trim();

    const assignMatch = rawLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
    if (assignMatch && !rawLine.startsWith('def ') && !rawLine.startsWith('class ')) {
      const [, name, op, rhs] = assignMatch;

      // Check if value changed from prevEvent
      const prevVal = prevEvent?.locals?.[name]?.value;
      const curVal = event.locals?.[name]?.value;

      if (op === '=') {
        if (prevVal === undefined) {
          return `Python สร้าง object จากค่า "${rhs.trim()}" แล้วให้ชื่อ "${name}" ชี้ไปที่มัน\nตัวแปรใน Python คือ "ป้ายชื่อ" ไม่ใช่กล่อง — หลายชื่อชี้หาค่าเดียวกันได้\n${curVal !== undefined ? `ค่าปัจจุบัน: ${curVal}` : ''}`;
        } else {
          return `ป้ายชื่อ "${name}" ย้ายไปชี้ค่าใหม่ (${curVal ?? rhs.trim()}) แทน (${prevVal})\nค่าเดิมยังอยู่ใน memory จนกว่าจะไม่มีชื่อใดชี้ถึง — Python จะลบออกเอง (Garbage Collection)`;
        }
      }

      if (op === '+=') {
        return `"+=" คือการบวกเพิ่มเข้าค่าเดิม\nเทียบเท่า ${name} = ${name} + (ค่าที่บวก)\n${prevVal !== undefined && curVal !== undefined ? `${prevVal} → ${curVal}` : ''}`;
      }
      if (op === '-=') {
        return `"-=" ลดค่าออกจากตัวแปร "${name}" โดยตรง\n${prevVal !== undefined && curVal !== undefined ? `${prevVal} → ${curVal}` : ''}`;
      }
      if (op === '*=') {
        return `"*=" คูณค่าเดิมของ "${name}" กับตัวเลขที่ระบุ\n${prevVal !== undefined && curVal !== undefined ? `${prevVal} → ${curVal}` : ''}`;
      }
    }

    if (rawLine.startsWith('for ')) {
      return `ลูป for ดึงค่าออกจาก iterable ทีละค่า\nPython ไม่นับรอบ — มันเดินผ่านค่าแต่ละตัวในลำดับ\nหากแก้ iterable ระหว่างลูป อาจเกิดผลลัพธ์ที่ไม่คาดคิด`;
    }

    if (rawLine.startsWith('while ')) {
      return `ลูป while ทำซ้ำตราบใดที่เงื่อนไขเป็น True\nPython ตรวจเงื่อนไขก่อนทุกรอบ — ถ้า False ตั้งแต่แรก จะไม่รันเลย\nต้องระวังการวนไม่สิ้นสุด (infinite loop)`;
    }

    if (rawLine.startsWith('if ') || rawLine.startsWith('elif ')) {
      return `Python ประเมินเงื่อนไขเป็น True/False (Boolean)\nค่า 0, "", None, [], {} นับเป็น "falsy" โดยอัตโนมัติ\nไม่ต้องเปรียบเทียบกับ True/False โดยตรงเสมอไป`;
    }

    if (rawLine.startsWith('def ')) {
      const fnMatch = rawLine.match(/^def\s+([a-zA-Z0-9_]+)/);
      const fnName = fnMatch ? fnMatch[1] : 'ฟังก์ชัน';
      return `"def" สร้างฟังก์ชัน "${fnName}" เป็น object ใน memory\nสามารถเรียกซ้ำได้หลายครั้ง โดยไม่ต้องเขียนโค้ดซ้ำ\nฟังก์ชันใน Python รับส่งข้อมูลผ่าน parameters และ return value`;
    }

    if (rawLine.startsWith('class ')) {
      const clsMatch = rawLine.match(/^class\s+([a-zA-Z0-9_]+)/);
      const clsName = clsMatch ? clsMatch[1] : 'คลาส';
      return `"class" เป็นแม่แบบ (blueprint) สำหรับสร้าง object\nทุก object จาก "${clsName}" มี attribute ของตัวเอง แต่ใช้ method เดียวกัน\nใช้ self เพื่ออ้างอิง attribute ของ object ตัวเอง`;
    }

    if (rawLine.includes('print(')) {
      return `print() แสดงข้อมูลออกทาง stdout\nPython แปลงทุกค่าเป็น string ก่อนแสดง โดยเรียก str() อัตโนมัติ\nการ print ไม่เปลี่ยนค่าตัวแปร — แค่แสดงให้เห็นเท่านั้น`;
    }

    if (rawLine.startsWith('return ')) {
      return `"return" ส่งค่ากลับและจบการทำงานของฟังก์ชันทันที\nโค้ดหลัง return จะไม่ถูกรัน\nถ้าไม่มี return หรือ return เปล่า ๆ Python จะคืนค่า None`;
    }

    if (rawLine.startsWith('import ') || rawLine.startsWith('from ')) {
      return `"import" โหลดโมดูลเข้า memory และผูกชื่อไว้ใน namespace ปัจจุบัน\nโมดูลที่ import แล้วจะถูก cache ไว้ — import ซ้ำไม่โหลดใหม่\nใช้ "as" เพื่อตั้งชื่อย่อให้สะดวก`;
    }
  }

  return null;
}
