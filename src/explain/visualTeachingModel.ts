import type { TraceEvent, Value } from '../runtime/types';

export type VisualTeachingCardKind =
  | 'for'
  | 'while'
  | 'class'
  | 'assignment'
  | 'stdout'
  | 'exception'
  | 'call'
  | 'return'
  | 'unknown';

export interface ObservedLocal {
  name: string;
  type: string;
  value: string;
}

export interface VisualTeachingCard {
  titleTh: string;
  questionTh: string;
  explanationTh: string;
  misconceptionTh: string;
  observed: ObservedLocal[];
  kind: VisualTeachingCardKind;
}

/**
 * ตัดแท็ก HTML พื้นฐานออกเพื่อความปลอดภัย ไม่สร้างหรืออนุญาตให้แสดงแท็ก HTML
 * แต่ยังคงรูปแบบ string ทั่วไปของ Python เช่น <Dog object at 0x...>
 */
export function sanitizeNoHtml(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(
    /<\/?(?:a|b|i|u|p|s|q|em|strong|small|span|div|script|style|iframe|img|h[1-6]|ul|ol|li|table|tr|td|th|tbody|thead|input|button|form|label|select|option)\b[^>]*>/gi,
    ''
  );
}

/**
 * ดึงข้อความบรรทัดโค้ดตามหมายเลขบรรทัด 1-indexed โดยตัดช่องว่างหัวท้าย
 */
export function extractSourceLine(sourceSnapshot?: string | null, line?: number): string {
  if (!sourceSnapshot || !line || line < 1) return '';
  const lines = sourceSnapshot.split(/\r?\n/);
  if (line <= lines.length) {
    return lines[line - 1]?.trim() ?? '';
  }
  return '';
}

/**
 * จัดรูปแบบตัวแปรที่สังเกตได้ (observed locals) โดยจำกัดไม่เกิน 6 ตัวแปร (safe truncation max6)
 * และป้องกันแท็ก HTML เป็น string สำหรับแสดงผลเท่านั้น (display not eval)
 */
export function formatObservedLocals(
  locals?: Record<string, Value> | null
): ObservedLocal[] {
  if (!locals || typeof locals !== 'object') {
    return [];
  }
  const entries = Object.entries(locals);
  const sliced = entries.slice(0, 6);
  return sliced.map(([name, val]) => {
    const rawType = typeof val?.type === 'string' ? val.type : 'unknown';
    const rawValue = typeof val?.value === 'string' ? val.value : String(val?.value ?? 'None');
    return {
      // React renders plain text: preserve recorded values, never strip user data as HTML.
      name: name.slice(0, 100),
      type: rawType.slice(0, 80),
      value: rawValue.slice(0, 500),
    };
  });
}

const NOT_ASSIGNMENT_KEYWORDS =
  /^(?:def|if|elif|while|for|class|return|yield|import|from|assert|with|raise|try|except|finally)\b/;
const ASSIGN_OP_REGEX =
  /^([^=!<>\s]+(?:\s*,\s*[^=!<>\s]+)*|\S+)\s*(=|\+=|-=|\*=|\/=|\/\/=|\%=|\*\*=)(?!=)\s*(.*)$/;

/**
 * ตรวจสอบชนิดโครงสร้างไวยากรณ์อย่างระมัดระวัง (conservative syntax identification)
 * ใช้ regex เพื่อสร้างคำอธิบายเชิงไวยากรณ์เท่านั้น ไม่คำนวณการทำงานล่วงหน้า
 */
export function identifySyntaxKind(lineText: string, eventKind?: string): VisualTeachingCardKind {
  if (eventKind === 'stdout') return 'stdout';
  if (eventKind === 'exception') return 'exception';
  if (eventKind === 'call') return 'call';
  if (eventKind === 'return') return 'return';

  const trimmed = lineText.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return 'unknown';
  }

  if (/^for\b/.test(trimmed)) {
    return 'for';
  }
  if (/^while\b/.test(trimmed)) {
    return 'while';
  }
  if (/^class\b/.test(trimmed)) {
    return 'class';
  }
  if (!NOT_ASSIGNMENT_KEYWORDS.test(trimmed) && ASSIGN_OP_REGEX.test(trimmed)) {
    return 'assignment';
  }

  return 'unknown';
}

/**
 * วิเคราะห์และแยกแยะการเรียกใช้ range() ในคำสั่ง for
 * รองรับเฉพาะกรณีที่เป็นตัวเลข literal ชัดเจน (เช่น range(3) หรือ range(1, 5))
 * หากเป็นตัวแปรหรือนิพจน์ จะอธิบายหลักการทั่วไปโดยไม่เดาตัวเลข
 */
function parseRangeSyntax(lineText: string): {
  hasRange: boolean;
  stopLiteral?: number;
  startLiteral?: number;
  explanationPart: string;
} {
  const rangeMatch = lineText.match(/^for\s+\w+\s+in\s+range\s*\(([^)]+)\)\s*:/);
  if (!rangeMatch) {
    return {
      hasRange: false,
      explanationPart: '',
    };
  }

  const rawArgs = rangeMatch[1].split(',').map((s) => s.trim());
  if (rawArgs.length === 1 && /^-?\d+$/.test(rawArgs[0])) {
    const stopNum = parseInt(rawArgs[0], 10);
    const stopDesc =
      stopNum > 0
        ? `ช่วงข้อมูล range(${stopNum}) จะเริ่มจาก 0 ถึง ${stopNum - 1} มี ${stopNum} ค่า (ลูปอาจหยุดก่อนด้วย break หรือ exception) โดยไม่รวมค่า stop (ไม่รวมเลข ${stopNum} ซึ่งเป็นจุดสิ้นสุด/ghost boundary)`
        : `ช่วงข้อมูล range(${stopNum}) มีค่าสิ้นสุดก่อนถึง ${stopNum} โดยไม่รวมค่า stop`;
    return {
      hasRange: true,
      stopLiteral: stopNum,
      startLiteral: 0,
      explanationPart: stopDesc,
    };
  }

  if (rawArgs.length >= 2 && /^-?\d+$/.test(rawArgs[1])) {
    const stopNum = parseInt(rawArgs[1], 10);
    const startNum = /^-?\d+$/.test(rawArgs[0]) ? parseInt(rawArgs[0], 10) : undefined;
    return {
      hasRange: true,
      stopLiteral: stopNum,
      startLiteral: startNum,
      explanationPart: `ช่วงข้อมูล range(${rawArgs.join(', ')}) จะหยุดก่อนถึงค่า stop เสมอ (ไม่รวมเลข ${stopNum})`,
    };
  }

  return {
    hasRange: true,
    explanationPart: 'ฟังก์ชัน range() จะสร้างลำดับตัวเลขโดยหยุดก่อนถึงค่า stop เสมอ (ไม่รวมค่า stop ในการวนซ้ำ)',
  };
}

/**
 * ฟังก์ชันบริสุทธิ์ (Pure function) สำหรับคำนวณการ์ดการสอนเชิงภาพ (Visual Teaching Card)
 * ได้รับแรงบันดาลใจจากเทคนิคการสอนของ Learnara:
 * 1. ตัวแปร: เครื่องหมาย = (กำหนดค่า) vs == (เปรียบเทียบ), กล่องหน่วยความจำ, การแทนที่ค่าเดิม, และ NameError เมื่อเรียกใช้ตัวแปรที่ยังไม่ได้กำหนด
 * 2. ลูป for: range(3) ได้ 0, 1, 2 โดยไม่รวมเลข 3 (excludes stop), การเยื้องบรรทัด (indentation) กำหนดขอบเขตลูป
 * 3. ลูป while: ทำซ้ำแทนการ copy-paste, ตัวแปรนับรอบ (counter) เพื่อป้องกันลูปไม่รู้จบ, และไม่มีการทึกทักผลลัพธ์ boolean ล่วงหน้า
 * 4. คลาส: แม่พิมพ์ (reusable mould/blueprint) และช่องเก็บข้อมูลเฉพาะตัว (distinct slots/attributes) ของแต่ละ instance
 * 5. เหตุการณ์ pre-line ต้องระบุ 'กำลังจะทำ' อย่างชัดเจน ไม่เคลมว่าคำสั่งหรือเงื่อนไขถูกประเมินแล้ว
 */
export function computeVisualTeachingCard(
  event?: TraceEvent | null,
  sourceSnapshot?: string | null
): VisualTeachingCard {
  // 1. กรณีไม่มี event (null หรือ undefined)
  if (!event) {
    return {
      titleTh: 'ไม่มีข้อมูลเหตุการณ์',
      questionTh: 'ระบบกำลังรอรับเหตุการณ์คำสั่งถัดไปใช่หรือไม่?',
      explanationTh: 'ไม่พบข้อมูลเหตุการณ์การประมวลผล (ไม่มี TraceEvent)',
      misconceptionTh: 'การวิเคราะห์การทำงานต้องอิงตามเหตุการณ์จริงที่เกิดขึ้นในระบบ',
      observed: [],
      kind: 'unknown',
    };
  }

  const observed = formatObservedLocals(event.locals);

  // 2. เหตุการณ์ผลลัพธ์ stdout
  if (event.kind === 'stdout') {
    const textOut = event.text !== undefined ? event.text : '';
    return {
      titleTh: 'แสดงผลลัพธ์ทางหน้าจอ (stdout)',
      questionTh: 'ข้อความที่แสดงผลออกทางหน้าจอตรงกับที่โปรแกรมตั้งใจพิมพ์หรือไม่?',
      explanationTh: `ข้อความที่พิมพ์ออกทางหน้าจอ: "${textOut}"`,
      misconceptionTh:
        'ความเข้าใจผิดที่พบบ่อย: สับสนระหว่างการแสดงผลข้อความด้วย print() กับการคืนค่า (return) หรือการบันทึกค่าลงตัวแปร โดย stdout เป็นเพียงการแสดงข้อความให้ผู้ใช้เห็นเท่านั้น ไม่ได้เปลี่ยนแปลงสถานะตัวแปร',
      observed,
      kind: 'stdout',
    };
  }

  // 3. เหตุการณ์ข้อผิดพลาด exception
  if (event.kind === 'exception') {
    const errText = event.text || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ';
    const isNameError = errText.includes('NameError');
    return {
      titleTh: 'เกิดข้อผิดพลาด (Exception)',
      questionTh: isNameError
        ? 'ตัวแปรนี้ถูกกำหนดค่าไว้ก่อนเรียกใช้งานหรือยัง?'
        : 'ข้อผิดพลาดนี้ระบุสาเหตุอะไร และต้องแก้ไขคำสั่งอย่างไร?',
      explanationTh: isNameError
        ? `เกิดข้อผิดพลาด NameError: ${errText} (มีการเรียกใช้ตัวแปรที่ยังไม่ได้กำหนดค่าในหน่วยความจำ)`
        : `เกิดข้อผิดพลาดในการประมวลผล: ${errText}`,
      misconceptionTh: isNameError
        ? 'ความเข้าใจผิดที่พบบ่อย: คิดว่าตัวแปรที่ยังไม่ได้กำหนดค่าจะมีค่าเริ่มต้นอัตโนมัติ (เช่น 0 หรือ None) แต่ในภาษา Python จะเกิด NameError ทันทีหากเรียกใช้ตัวแปรที่ยังไม่ได้ประกาศค่า'
        : 'ความเข้าใจผิดที่พบบ่อย: คิดว่าโปรแกรมจะข้ามบรรทัดที่เกิดข้อผิดพลาดแล้วทำงานต่อได้เอง (ความจริงข้อผิดพลาดจะหยุดการทำงานของโปรแกรมทันที เว้นแต่จะมีการจัดการด้วย try-except)',
      observed,
      kind: 'exception',
    };
  }

  // 4. เหตุการณ์เรียกใช้ฟังก์ชัน call
  if (event.kind === 'call') {
    const fnName = event.name || 'ฟังก์ชัน';
    return {
      titleTh: `เรียกใช้งานฟังก์ชัน ${fnName}()`,
      questionTh: 'ฟังก์ชันนี้รับพารามิเตอร์ใดบ้าง และเตรียมจัดสรรตัวแปรภายในอย่างไร?',
      explanationTh: `เข้าสู่ฟังก์ชัน "${fnName}" และสร้างเฟรมใหม่ใน Call Stack สำหรับจัดเก็บตัวแปรเฉพาะที่ (local variables)`,
      misconceptionTh:
        'ความเข้าใจผิดที่พบบ่อย: คิดว่าตัวแปรที่สร้างหรือเปลี่ยนแปลงภายในฟังก์ชันจะปะปนกับตัวแปรภายนอก (ตัวแปรในฟังก์ชันมีขอบเขตเฉพาะในเฟรมของตนเอง)',
      observed,
      kind: 'call',
    };
  }

  // 5. เหตุการณ์คืนค่าจากฟังก์ชัน return
  if (event.kind === 'return') {
    const fnName = event.name || 'ฟังก์ชัน';
    const retVal = event.text !== undefined ? event.text : '(trace ไม่ได้บันทึกค่าคืน)';
    return {
      titleTh: `คืนค่าจากฟังก์ชัน ${fnName}()`,
      questionTh: 'ค่าที่ฟังก์ชันส่งคืนนี้จะถูกนำไปใช้ต่อที่ใดในโปรแกรม?',
      explanationTh: `ฟังก์ชัน "${fnName}" ทำงานเสร็จสิ้นและส่งคืนค่า "${retVal}" พร้อมทั้งนำเฟรมออกจาก Call Stack`,
      misconceptionTh:
        'ความเข้าใจผิดที่พบบ่อย: สับสนระหว่างคำสั่ง return (ส่งค่าผลลัพธ์กลับไปให้โค้ดส่วนอื่นใช้ต่อ) กับคำสั่ง print() (เพียงแค่แสดงข้อความบนหน้าจอ)',
      observed,
      kind: 'return',
    };
  }

  // 6. เหตุการณ์ก่อนรันบรรทัด (pre-line event: kind === 'line')
  if (event.kind === 'line') {
    const lineText = extractSourceLine(sourceSnapshot, event.line);
    const syntaxKind = identifySyntaxKind(lineText, event.kind);

    if (syntaxKind === 'for') {
      const rangeInfo = parseRangeSyntax(lineText);
      const varMatch = lineText.match(/^for\s+([a-zA-Z_\u0E00-\u0E7F][a-zA-Z0-9_\u0E00-\u0E7F]*)/);
      const loopVar = varMatch ? varMatch[1] : 'ตัวแปรลูป';

      let rangeDetail = rangeInfo.explanationPart;
      if (!rangeDetail) {
        rangeDetail = 'กำลังจะดึงข้อมูลทีละตัวจากลำดับเพื่อนำมาประมวลผลในลูป';
      }

      return {
        titleTh: 'ลูป for (กำลังจะทำ)',
        questionTh: `ตัวแปร "${loopVar}" จะรับค่าใดบ้างในแต่ละรอบ และคำสั่งใดบ้างที่อยู่ภายใต้การเยื้องบรรทัดของลูป?`,
        explanationTh: `[กำลังจะทำ] กำลังจะเข้าสู่การวนลูป for: ${rangeDetail} ตัวแปรลูป "${loopVar}" จะรับค่าตามลำดับ และบล็อกคำสั่งที่เยื้อง (indentation) จะถูกทำซ้ำในแต่ละรอบ`,
        misconceptionTh:
          rangeInfo.stopLiteral !== undefined
            ? `ความเข้าใจผิดที่พบบ่อย: คิดว่า range(${rangeInfo.stopLiteral}) จะวนรอบรวมเลข ${rangeInfo.stopLiteral} ด้วย (ความจริงคือ range จะหยุดก่อนถึงค่า stop เสมอ โดยไม่รวมเลข ${rangeInfo.stopLiteral}) และเข้าใจผิดเรื่องการเยื้องบรรทัด (indentation) โดยคำสั่งที่ไม่เยื้องจะอยู่นอกลูปและทำงานเพียงครั้งเดียวหลังจบลูป`
            : 'ความเข้าใจผิดที่พบบ่อย: คิดว่า range() จะวนรอบรวมค่า stop ตัวสุดท้ายด้วย (ความจริงคือ range ใน Python จะหยุดก่อนถึงค่า stop เสมอ โดยไม่รวมค่า stop) และเข้าใจผิดเรื่องการเยื้องบรรทัด (indentation) โดยคำสั่งที่ไม่เยื้องจะอยู่นอกลูปและทำงานเพียงครั้งเดียวหลังจบลูป',
        observed,
        kind: 'for',
      };
    }

    if (syntaxKind === 'while') {
      return {
        titleTh: 'ลูป while (กำลังจะทำ)',
        questionTh: 'เงื่อนไขในลูป while นี้จะถูกตรวจสอบในแต่ละรอบอย่างไร และมีการเพิ่มค่าตัวแปรควบคุมรอบหรือไม่?',
        explanationTh:
          '[กำลังจะทำ] กำลังจะตรวจสอบเงื่อนไขในลูป while (ยังไม่มีการตัดสินผลลัพธ์ของเงื่อนไขว่าผ่านหรือไม่ผ่าน) การใช้ while ช่วยทำงานซ้ำโดยไม่ต้องคัดลอกคำสั่งเดิม (repeat vs copy-paste) ต้องมีทางออก เช่น เปลี่ยนสถานะเงื่อนไขหรือ break ไม่จำเป็นต้องใช้ตัวนับทุกลูป',
        misconceptionTh:
          'ความเข้าใจผิดที่พบบ่อย: คิดว่าเงื่อนไขถูกตัดสินไปแล้วก่อนเริ่มบรรทัดคำสั่ง หรือลืมอัปเดตตัวแปรนับรอบ (counter) จนทำให้โปรแกรมติดอยู่ในลูปไม่รู้จบ (infinite loop) และสับสนว่า while จะทำงานครั้งเดียวเหมือน if',
        observed,
        kind: 'while',
      };
    }

    if (syntaxKind === 'class') {
      const clsMatch = lineText.match(/^class\s+([a-zA-Z_\u0E00-\u0E7F][a-zA-Z0-9_\u0E00-\u0E7F]*)/);
      const clsName = clsMatch ? clsMatch[1] : '';
      return {
        titleTh: clsName ? `นิยามคลาส ${clsName} (กำลังจะทำ)` : 'นิยามคลาส (กำลังจะทำ)',
        questionTh: 'คลาสนี้ทำหน้าที่เป็นแม่พิมพ์ (blueprint) อย่างไร และแต่ละอ็อบเจกต์มีช่องเก็บข้อมูลแยกกันอย่างไร?',
        explanationTh: `[กำลังจะทำ] กำลังจะสร้างแม่พิมพ์ (Blueprint/Mould) ของคลาส ${clsName ? `"${clsName}"` : ''} เพื่อใช้สร้างอ็อบเจกต์ โดยอ็อบเจกต์สามารถมีข้อมูลเฉพาะตัว แต่ class attributes และข้อมูล mutable ที่ชี้ร่วมกันอาจใช้ร่วมกันได้`,
        misconceptionTh:
          'ความเข้าใจผิดที่พบบ่อย: คิดว่าการประกาศคลาสคือการสร้างอ็อบเจกต์และกำหนดค่าทันที (ความจริงเป็นเพียงการสร้างแม่พิมพ์) หรือคิดว่าอ็อบเจกต์ทุกตัวใช้ข้อมูลร่วมกัน (แต่ละ instance มีช่องเก็บข้อมูลแยกเป็นอิสระต่อกัน)',
        observed,
        kind: 'class',
      };
    }

    if (syntaxKind === 'assignment') {
      const assignMatch = lineText.match(ASSIGN_OP_REGEX);
      const targetVar = assignMatch ? assignMatch[1].trim() : 'ตัวแปร';
      const assignOp = assignMatch ? assignMatch[2] : '=';
      const rightExpr = assignMatch ? assignMatch[3].trim() : '';
      return {
        titleTh: `กำหนดค่าตัวแปร ${targetVar} (กำลังจะทำ)`,
        questionTh: `เครื่องหมาย ${assignOp} ในคำสั่งนี้ทำหน้าที่อะไร และค่าใหม่จะเข้าไปแทนที่ในกล่องตัวแปรอย่างไร?`,
        explanationTh: `[กำลังจะทำ] กำลังจะนำค่า${rightExpr ? ` "${rightExpr}"` : ''} ไปบันทึกลงในกล่องตัวแปร "${targetVar}" (แทนที่ค่าเดิมหากมีอยู่แล้ว และยังไม่ได้ยืนยันว่าการคำนวณเสร็จสิ้น)`,
        misconceptionTh:
          'ความเข้าใจผิดที่พบบ่อย: สับสนระหว่างเครื่องหมายกำหนดค่า (=) กับเครื่องหมายเปรียบเทียบความเท่ากัน (==) โดยเครื่องหมาย = ในภาษา Python หมายถึงการนำค่าทางขวาไปบันทึกลงในกล่องตัวแปรทางซ้าย ไม่ใช่สมการทางคณิตศาสตร์ และการอ่านค่าตัวแปรที่ยังไม่ได้กำหนดค่าจะเกิดข้อผิดพลาด NameError',
        observed,
        kind: 'assignment',
      };
    }

    // คำสั่ง pre-line อื่นๆ ที่ไม่ตรงกับกลุ่มข้างต้น
    return {
      titleTh: `ประมวลผลคำสั่ง (กำลังจะทำ)`,
      questionTh: 'คำสั่งในบรรทัดนี้จะส่งผลต่อสถานะของโปรแกรมอย่างไร?',
      explanationTh: `[กำลังจะทำ] กำลังจะประมวลผลคำสั่งในบรรทัดที่ ${event.line}${lineText ? `: "${lineText}"` : ''} (ยังไม่ได้ตัดสินผลลัพธ์หรือยืนยันผลการทำงาน)`,
      misconceptionTh:
        'ความเข้าใจผิดที่พบบ่อย: การอ่านโค้ดต้องติดตามลำดับการทำงานทีละขั้นตอนตามที่โปรแกรมประมวลผลจริง (Execution Order) ไม่ใช่เพียงตำแหน่งที่เขียนไว้',
      observed,
      kind: 'unknown',
    };
  }

  // 7. เหตุการณ์อื่นๆ ที่ kind ไม่เป็น line, stdout, exception, call, return
  return {
    titleTh: `เหตุการณ์ ${event.kind}`,
    questionTh: 'เหตุการณ์นี้ส่งผลต่อการทำงานของโปรแกรมอย่างไร?',
    explanationTh: `ประมวลผลเหตุการณ์ ${event.kind} ในระบบ`,
    misconceptionTh: 'การวิเคราะห์การทำงานต้องอิงตามเหตุการณ์จริงที่เกิดขึ้นในระบบ',
    observed,
    kind: 'unknown',
  };
}
