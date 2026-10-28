import type { Completion } from '../runtime/types';

export interface SignatureHelpResult {
  label: string;
  documentation?: string;
  parameters: { label: string; documentation?: string }[];
  activeParameter: number;
}

export interface HoverResult {
  contents: string[];
}

export const PYTHON_KEYWORDS = [
  'def', 'class', 'import', 'from', 'if', 'elif', 'else', 'for', 'while',
  'return', 'yield', 'try', 'except', 'finally', 'with', 'as', 'pass',
  'break', 'continue', 'in', 'is', 'not', 'and', 'or', 'True', 'False',
  'None', 'raise', 'global', 'nonlocal', 'lambda', 'assert', 'del',
];

export const PYTHON_BUILTINS: Record<string, { kind: string; detail: string; docTh: string; sig?: string }> = {
  print: {
    kind: 'function',
    detail: 'built-in function print(*values, sep=" ", end="\\n")',
    docTh: 'พิมพ์ข้อความหรือค่าตัวแปรออกทางคอนโซลมาตรฐาน (stdout)',
    sig: 'print(*values, sep=" ", end="\\n", file=None, flush=False)',
  },
  len: {
    kind: 'function',
    detail: 'built-in function len(s) -> int',
    docTh: 'คืนค่าจำนวนสมาชิกในอ็อบเจกต์ (เช่น list, string, dict, tuple)',
    sig: 'len(s)',
  },
  range: {
    kind: 'class',
    detail: 'built-in type range(stop) หรือ range(start, stop[, step])',
    docTh: 'สร้างลำดับตัวเลขจำนวนเต็มสำหรับใช้ในการวนลูป for',
    sig: 'range(start, stop[, step])',
  },
  str: {
    kind: 'class',
    detail: 'built-in type str(object="") -> str',
    docTh: 'แปลงข้อมูลเป็นข้อความตัวอักษร (String)',
    sig: 'str(object="")',
  },
  int: {
    kind: 'class',
    detail: 'built-in type int(x=0) -> int',
    docTh: 'แปลงข้อมูลเป็นจำนวนเต็ม (Integer)',
    sig: 'int(x=0, base=10)',
  },
  float: {
    kind: 'class',
    detail: 'built-in type float(x=0.0) -> float',
    docTh: 'แปลงข้อมูลเป็นจำนวนทศนิยม (Float)',
    sig: 'float(x=0.0)',
  },
  list: {
    kind: 'class',
    detail: 'built-in type list(iterable=()) -> list',
    docTh: 'สร้างหรือแปลงโครงสร้างข้อมูลเป็นแบบรายการ (List)',
    sig: 'list(iterable=())',
  },
  dict: {
    kind: 'class',
    detail: 'built-in type dict(**kwargs) -> dict',
    docTh: 'สร้างพจนานุกรมจับคู่คีย์-ค่า (Dictionary)',
    sig: 'dict(**kwargs)',
  },
  sum: {
    kind: 'function',
    detail: 'built-in function sum(iterable, /, start=0)',
    docTh: 'หาผลรวมของตัวเลขทั้งหมดใน iterable',
    sig: 'sum(iterable, start=0)',
  },
  input: {
    kind: 'function',
    detail: 'built-in function input(prompt="") -> str',
    docTh: 'รอรับข้อความจากผู้ใช้ผ่านช่องรับข้อมูลคอนโซล',
    sig: 'input(prompt="")',
  },
};

export const WORLD_EXPORTS: Record<string, { kind: string; detail: string; docTh: string; sig?: string }> = {
  move_forward: {
    kind: 'function',
    detail: 'playground_world.move_forward() -> None',
    docTh: 'สั่งให้ตัวละคร 3 มิติก้าวไปข้างหน้า 1 ช่องบนทางเดิน',
    sig: 'move_forward()',
  },
  turn_left: {
    kind: 'function',
    detail: 'playground_world.turn_left() -> None',
    docTh: 'หมุนตัวละครไปทางซ้าย 90 องศา',
    sig: 'turn_left()',
  },
  turn_right: {
    kind: 'function',
    detail: 'playground_world.turn_right() -> None',
    docTh: 'หมุนตัวละครไปทางขวา 90 องศา',
    sig: 'turn_right()',
  },
  get_position: {
    kind: 'function',
    detail: 'playground_world.get_position() -> tuple[int, int]',
    docTh: 'คืนค่าพิกัดปัจจุบัน (x, y) ของตัวละครในฉาก',
    sig: 'get_position()',
  },
  has_reached_goal: {
    kind: 'function',
    detail: 'playground_world.has_reached_goal() -> bool',
    docTh: 'ตรวจสอบว่าตัวละครเดินถึงหีบสมบัติแล้วหรือไม่',
    sig: 'has_reached_goal()',
  },
};

export const MODULE_MEMBERS: Record<string, Record<string, { kind: string; detail: string; docTh: string; sig?: string }>> = {
  math: {
    pi: { kind: 'constant', detail: 'math.pi = 3.141592...', docTh: 'ค่าคงที่พาย (π)' },
    sqrt: { kind: 'function', detail: 'math.sqrt(x) -> float', docTh: 'คำนวณรากที่สองของ x', sig: 'sqrt(x)' },
    floor: { kind: 'function', detail: 'math.floor(x) -> int', docTh: 'ปัดเศษทศนิยมลง', sig: 'floor(x)' },
    ceil: { kind: 'function', detail: 'math.ceil(x) -> int', docTh: 'ปัดเศษทศนิยมขึ้น', sig: 'ceil(x)' },
  },
  json: {
    loads: { kind: 'function', detail: 'json.loads(s) -> Any', docTh: 'แปลงข้อความ JSON เป็น Python dict/list', sig: 'loads(s)' },
    dumps: { kind: 'function', detail: 'json.dumps(obj) -> str', docTh: 'แปลง Python object เป็นข้อความ JSON', sig: 'dumps(obj, indent=None)' },
  },
  random: {
    randint: { kind: 'function', detail: 'random.randint(a, b) -> int', docTh: 'สุ่มตัวเลขจำนวนเต็มระหว่าง a ถึง b (รวมทั้งสองค่า)', sig: 'randint(a, b)' },
    choice: { kind: 'function', detail: 'random.choice(seq) -> Any', docTh: 'สุ่มเลือกสมาชิกหนึ่งตัวจาก sequence', sig: 'choice(seq)' },
  },
};

/**
 * ดึงสัญลักษณ์ที่ผู้ใช้ประกาศในโค้ด (User-defined functions, classes, variables)
 */
export function extractUserSymbols(code: string): Completion[] {
  const symbols: Map<string, Completion> = new Map();
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // def foo(a, b):
    const fnMatch = trimmed.match(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\):/);
    if (fnMatch) {
      const name = fnMatch[1];
      const params = fnMatch[2];
      symbols.set(name, {
        label: name,
        kind: 'function',
        detail: `def ${name}(${params}) (ประกาศในโค้ด)`,
        insertText: `${name}()`,
      });
      continue;
    }

    // class Bar:
    const classMatch = trimmed.match(/^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (classMatch) {
      const name = classMatch[1];
      symbols.set(name, {
        label: name,
        kind: 'class',
        detail: `class ${name} (ประกาศในโค้ด)`,
      });
      continue;
    }

    // var = ...
    const varMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (varMatch && !trimmed.startsWith('def ') && !trimmed.startsWith('class ')) {
      const name = varMatch[1];
      if (!symbols.has(name)) {
        symbols.set(name, {
          label: name,
          kind: 'variable',
          detail: `ตัวแปร ${name}`,
        });
      }
    }
  }

  return Array.from(symbols.values());
}

/**
 * คำนวณรายการคำแนะนำ Autocomplete จากตำแหน่งเคอร์เซอร์ (1-based line & column)
 */
export function getPythonCompletions(code: string, line: number, column: number): Completion[] {
  const lines = code.split('\n');
  const lineContent = lines[line - 1] ?? '';
  const textBeforeCursor = lineContent.slice(0, column - 1);

  // ตรวจจับกรณีพิมพ์จุด เช่น "math." หรือ "playground_world."
  const dotMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.$/);
  if (dotMatch) {
    const moduleName = dotMatch[1];
    if (moduleName === 'playground_world') {
      return Object.entries(WORLD_EXPORTS).map(([name, info]) => ({
        label: name,
        kind: info.kind,
        detail: info.detail,
        insertText: info.sig ? `${name}()` : name,
      }));
    }
    if (MODULE_MEMBERS[moduleName]) {
      return Object.entries(MODULE_MEMBERS[moduleName]).map(([name, info]) => ({
        label: name,
        kind: info.kind,
        detail: info.detail,
        insertText: info.sig ? `${name}()` : name,
      }));
    }
    return [];
  }

  // ดึงคำนำหน้าปัจจุบัน
  const wordMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
  const prefix = wordMatch ? wordMatch[1].toLowerCase() : '';

  const results: Completion[] = [];

  // Keywords
  for (const kw of PYTHON_KEYWORDS) {
    if (!prefix || kw.toLowerCase().startsWith(prefix)) {
      results.push({
        label: kw,
        kind: 'keyword',
        detail: `Python keyword: ${kw}`,
      });
    }
  }

  // Builtins
  for (const [name, info] of Object.entries(PYTHON_BUILTINS)) {
    if (!prefix || name.toLowerCase().startsWith(prefix)) {
      results.push({
        label: name,
        kind: info.kind,
        detail: info.detail,
        insertText: info.sig ? `${name}()` : name,
      });
    }
  }

  // World functions (ถ้านำเข้าหรือใช้ทั่วไป)
  for (const [name, info] of Object.entries(WORLD_EXPORTS)) {
    if (!prefix || name.toLowerCase().startsWith(prefix)) {
      results.push({
        label: name,
        kind: info.kind,
        detail: info.detail,
        insertText: `${name}()`,
      });
    }
  }

  // User symbols
  const userSymbols = extractUserSymbols(code);
  for (const sym of userSymbols) {
    if (!prefix || sym.label.toLowerCase().startsWith(prefix)) {
      results.push(sym);
    }
  }

  return results;
}

/**
 * ให้ข้อมูล Signature Help เมื่อพิมพ์วงเล็บเปิด เช่น `print(`
 */
export function getPythonSignatureHelp(code: string, line: number, column: number): SignatureHelpResult | null {
  const lines = code.split('\n');
  const lineContent = lines[line - 1] ?? '';
  const textBeforeCursor = lineContent.slice(0, column - 1);

  // หาชื่อฟังก์ชันหน้าวงเล็บเปิด
  const fnMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^()]*)$/);
  if (!fnMatch) return null;

  const fnName = fnMatch[1];
  const argsText = fnMatch[2];
  const commaCount = (argsText.match(/,/g) || []).length;

  // ตรวจสอบ builtins
  if (PYTHON_BUILTINS[fnName] && PYTHON_BUILTINS[fnName].sig) {
    const info = PYTHON_BUILTINS[fnName];
    const sigStr = info.sig!;
    const paramMatch = sigStr.match(/\((.*?)\)/);
    const paramList = paramMatch ? paramMatch[1].split(',').map((p) => ({ label: p.trim() })) : [];
    return {
      label: sigStr,
      documentation: info.docTh,
      parameters: paramList,
      activeParameter: Math.min(commaCount, Math.max(0, paramList.length - 1)),
    };
  }

  // ตรวจสอบ world exports
  if (WORLD_EXPORTS[fnName] && WORLD_EXPORTS[fnName].sig) {
    const info = WORLD_EXPORTS[fnName];
    const sigStr = info.sig!;
    return {
      label: sigStr,
      documentation: info.docTh,
      parameters: [],
      activeParameter: 0,
    };
  }

  return null;
}

/**
 * ให้ข้อมูล Hover Documentation สำหรับคำใต้เคอร์เซอร์
 */
export function getPythonHover(code: string, line: number, column: number): HoverResult | null {
  const lines = code.split('\n');
  const lineContent = lines[line - 1] ?? '';
  if (!lineContent) return null;

  // ค้นหาคำที่ครอบคลุม column
  const regex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
  let match: RegExpExecArray | null;
  let targetWord: string | null = null;

  while ((match = regex.exec(lineContent)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (column - 1 >= start && column - 1 <= end) {
      targetWord = match[0];
      break;
    }
  }

  if (!targetWord) return null;

  if (PYTHON_BUILTINS[targetWord]) {
    const item = PYTHON_BUILTINS[targetWord];
    return {
      contents: [
        `**${targetWord}** (${item.kind})\n\n\`${item.detail}\`\n\n${item.docTh}`,
      ],
    };
  }

  if (WORLD_EXPORTS[targetWord]) {
    const item = WORLD_EXPORTS[targetWord];
    return {
      contents: [
        `**${targetWord}** (${item.kind})\n\n\`${item.detail}\`\n\n${item.docTh}`,
      ],
    };
  }

  if (PYTHON_KEYWORDS.includes(targetWord)) {
    return {
      contents: [`**${targetWord}** (Python keyword)`],
    };
  }

  return null;
}
