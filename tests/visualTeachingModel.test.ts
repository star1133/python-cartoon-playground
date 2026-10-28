import { describe, it, expect } from 'vitest';
import {
  computeVisualTeachingCard,
  extractSourceLine,
  formatObservedLocals,
  identifySyntaxKind,
  sanitizeNoHtml,
  type VisualTeachingCard,
} from '../src/explain/visualTeachingModel';
import type { TraceEvent } from '../src/runtime/types';

describe('Visual Teaching Cards Model (Learnara Pedagogical Logic)', () => {
  // ---------------------------------------------------------------------------
  // 1. Pre-line events: explicitly 'กำลังจะทำ' and no claim of evaluated condition
  // ---------------------------------------------------------------------------
  describe('1. Pre-line semantics', () => {
    it('1.1 marks line events explicitly with "กำลังจะทำ" and never claims statement has executed', () => {
      const code = 'total = 100\nprint(total)';
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {},
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.explanationTh).toContain('กำลังจะทำ');
      expect(card.titleTh).toContain('กำลังจะทำ');
      expect(card.explanationTh).toContain('ยังไม่ได้ยืนยันว่าการคำนวณเสร็จสิ้น');
    });

    it('1.2 does not make causal attribution of current pre-line to existing locals', () => {
      const code = 'x = 5\nx = 7';
      // At line 2 (x = 7), locals still hold x = 5 from prior execution
      const event: TraceEvent = {
        seq: 2,
        kind: 'line',
        line: 2,
        locals: { x: { type: 'int', value: '5' } },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('assignment');
      expect(card.explanationTh).toContain('กำลังจะทำ');
      // Observed locals display current memory state (x = 5), not future state (x = 7)
      expect(card.observed).toEqual([{ name: 'x', type: 'int', value: '5' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Range syntax: excludes stop (literal and general), no generated current index
  // ---------------------------------------------------------------------------
  describe('2. For loop and range(stop) semantics (Reel DeUV8jev3JG)', () => {
    it('2.1 explains that range(3) produces 0, 1, 2 and excludes literal stop 3', () => {
      const code = [
        'for i in range(3):',
        "    print('Hop!')",
        "print('Done!')",
      ].join('\n');

      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {},
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('for');
      expect(card.explanationTh).toContain('กำลังจะทำ');
      expect(card.explanationTh).toContain('range(3)');
      expect(card.explanationTh).toContain('ไม่รวมค่า stop');
      expect(card.explanationTh).toContain('ไม่รวมเลข 3');
      expect(card.misconceptionTh).toContain('ไม่รวมเลข 3');
      expect(card.misconceptionTh).toContain('การเยื้องบรรทัด');

      // Crucial: No generated current index when i is not yet in locals!
      expect(card.observed).toEqual([]);
    });

    it('2.2 explains 2-argument range(1, 5) excludes literal stop 5', () => {
      const code = 'for step in range(1, 5):\n    pass';
      const event: TraceEvent = {
        seq: 2,
        kind: 'line',
        line: 1,
        locals: {},
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('for');
      expect(card.explanationTh).toContain('range(1, 5)');
      expect(card.explanationTh).toContain('ไม่รวมเลข 5');
    });

    it('2.3 explains general range(n) excludes stop without hallucinating a specific stop number', () => {
      const code = 'for item in range(n):\n    pass';
      const event: TraceEvent = {
        seq: 3,
        kind: 'line',
        line: 1,
        locals: { n: { type: 'int', value: '10' } },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('for');
      expect(card.explanationTh).toContain('หยุดก่อนถึงค่า stop เสมอ (ไม่รวมค่า stop');
      // Should NOT invent a literal stop number in the range description text
      expect(card.explanationTh).not.toContain('range(10)');
      // Observed locals display real n=10, but no generated loop index 'item'
      expect(card.observed).toEqual([{ name: 'n', type: 'int', value: '10' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. While loop: repeat vs copy-paste, no boolean condition invention (Reel DeSPdjsvD_k)
  // ---------------------------------------------------------------------------
  describe('3. While loop semantics (Reel DeSPdjsvD_k)', () => {
    it('3.1 does not invent boolean evaluation result at pre-line while condition', () => {
      const code = 'while count < 3:\n    count += 1';
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: { count: { type: 'int', value: '0' } },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('while');
      expect(card.explanationTh).toContain('กำลังจะทำ');
      expect(card.explanationTh).toContain('ยังไม่มีการตัดสินผลลัพธ์ของเงื่อนไข');
      // Must NOT claim that condition evaluated to True or False
      expect(card.explanationTh).not.toContain('เงื่อนไขเป็นจริง');
      expect(card.explanationTh).not.toContain('เงื่อนไขเป็นเท็จ');
      expect(card.explanationTh).toContain('repeat vs copy-paste');
      expect(card.misconceptionTh).toContain('ลูปไม่รู้จบ');
      expect(card.observed).toEqual([{ name: 'count', type: 'int', value: '0' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Stdout events: output only event.text
  // ---------------------------------------------------------------------------
  describe('4. Stdout semantics', () => {
    it('4.1 outputs only event.text without fabricating additional text', () => {
      const event: TraceEvent = {
        seq: 5,
        kind: 'stdout',
        line: 2,
        text: 'Hop!\n',
        locals: { i: { type: 'int', value: '0' } },
      };

      const card = computeVisualTeachingCard(event, "print('Hop!')");

      expect(card.kind).toBe('stdout');
      expect(card.explanationTh).toContain('Hop!\n');
      expect(card.explanationTh).toBe('ข้อความที่พิมพ์ออกทางหน้าจอ: "Hop!\n"');
      expect(card.observed).toEqual([{ name: 'i', type: 'int', value: '0' }]);
      expect(card.misconceptionTh).toContain('print()');
    });

    it('4.2 safely handles empty stdout text', () => {
      const event: TraceEvent = {
        seq: 6,
        kind: 'stdout',
        line: 1,
        text: '',
      };

      const card = computeVisualTeachingCard(event);

      expect(card.kind).toBe('stdout');
      expect(card.explanationTh).toBe('ข้อความที่พิมพ์ออกทางหน้าจอ: ""');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Unknown events & lines
  // ---------------------------------------------------------------------------
  describe('5. Unknown fallback semantics', () => {
    it('5.1 falls back cleanly to kind unknown on unclassified statements', () => {
      const code = 'pass';
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {},
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('unknown');
      expect(card.titleTh).toBeTruthy();
      expect(card.explanationTh).toContain('กำลังจะทำ');
      expect(card.misconceptionTh).toBeTruthy();
    });

    it('5.2 handles custom or unrecognized event kinds safely', () => {
      const event = {
        seq: 10,
        kind: 'custom_debugger_tick',
        line: 5,
      } as unknown as TraceEvent;

      const card = computeVisualTeachingCard(event);

      expect(card.kind).toBe('unknown');
      expect(card.titleTh).toContain('custom_debugger_tick');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Null and undefined safety
  // ---------------------------------------------------------------------------
  describe('6. Null & undefined robustness', () => {
    it('6.1 handles null event safely without throwing', () => {
      const card = computeVisualTeachingCard(null, 'x = 1');

      expect(card.kind).toBe('unknown');
      expect(card.titleTh).toBe('ไม่มีข้อมูลเหตุการณ์');
      expect(card.observed).toEqual([]);
    });

    it('6.2 handles undefined event and undefined source snapshot', () => {
      const card = computeVisualTeachingCard(undefined, undefined);

      expect(card.kind).toBe('unknown');
      expect(card.titleTh).toBe('ไม่มีข้อมูลเหตุการณ์');
      expect(card.explanationTh).toContain('ไม่มี TraceEvent');
    });

    it('6.3 handles out-of-range line numbers gracefully', () => {
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 999,
        locals: {},
      };

      const card = computeVisualTeachingCard(event, 'x = 1');

      expect(card.kind).toBe('unknown');
      expect(card.explanationTh).toContain('กำลังจะทำ');
      expect(card.explanationTh).toContain('999');
    });

    it('6.4 handles missing, null, or corrupted locals gracefully', () => {
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {
          corrupted: null as unknown as { type: string; value: string },
        },
      };

      const card = computeVisualTeachingCard(event, 'x = 1');

      expect(card.observed).toEqual([{ name: 'corrupted', type: 'unknown', value: 'None' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Unicode and Thai language preservation
  // ---------------------------------------------------------------------------
  describe('7. Unicode & Thai language support', () => {
    it('7.1 supports Thai variable names and Thai string literals in assignment', () => {
      const code = "ข้อความ = 'สวัสดีชาวโลก'";
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {
          ข้อความ: { type: 'str', value: "'สวัสดีชาวโลก'" },
        },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('assignment');
      expect(card.titleTh).toContain('ข้อความ');
      expect(card.explanationTh).toContain('ข้อความ');
      expect(card.explanationTh).toContain('สวัสดีชาวโลก');
      expect(card.observed).toEqual([
        { name: 'ข้อความ', type: 'str', value: "'สวัสดีชาวโลก'" },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Assignment vs comparison (= vs ==) (Reel DeWxvupPQai)
  // ---------------------------------------------------------------------------
  describe('8. Assignment vs equality comparison (= vs ==) (Reel DeWxvupPQai)', () => {
    it('8.1 identifies single = as assignment and clarifies misconception vs ==', () => {
      const code = 'x = 5';
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {},
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('assignment');
      expect(card.titleTh).toContain('กำหนดค่าตัวแปร x');
      expect(card.misconceptionTh).toContain('(=)');
      expect(card.misconceptionTh).toContain('(==)');
      expect(card.misconceptionTh).toContain('NameError');
    });

    it('8.2 does NOT classify == comparison expression as an assignment', () => {
      const code = 'x == 5';
      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: { x: { type: 'int', value: '5' } },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).not.toBe('assignment');
      expect(card.kind).toBe('unknown');
    });

    it('8.3 supports compound assignment like +=', () => {
      const code = 'count += 1';
      const event: TraceEvent = {
        seq: 2,
        kind: 'line',
        line: 1,
        locals: { count: { type: 'int', value: '2' } },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('assignment');
      expect(card.titleTh).toContain('count');
      expect(card.questionTh).toContain('+=');
    });

    it('8.4 handles y = x + 1 assignment fix from reel DeWxvupPQai', () => {
      const code = 'y = x + 1';
      const event: TraceEvent = {
        seq: 4,
        kind: 'line',
        line: 1,
        locals: { x: { type: 'int', value: '7' } },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('assignment');
      expect(card.titleTh).toContain('y');
      expect(card.explanationTh).toContain('x + 1');
      expect(card.observed).toEqual([{ name: 'x', type: 'int', value: '7' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Class definitions: mould and distinct slots (Reel DdroGSmhRv6)
  // ---------------------------------------------------------------------------
  describe('9. Class definition semantics (Reel DdroGSmhRv6)', () => {
    it('9.1 explains class as blueprint/mould with distinct slots for instances', () => {
      const code = [
        'class Dog:',
        '    def __init__(self, age):',
        '        self.age = age',
      ].join('\n');

      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {},
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('class');
      expect(card.titleTh).toContain('Dog');
      expect(card.explanationTh).toContain('กำลังจะทำ');
      expect(card.explanationTh).toContain('แม่พิมพ์');
      expect(card.explanationTh).toContain('class attributes');
      expect(card.explanationTh).toContain('อาจใช้ร่วมกันได้');
      expect(card.misconceptionTh).toContain('แม่พิมพ์');

      // Crucial: No assert class attributes unless serialized data!
      expect(card.observed).toEqual([]);
    });

    it('9.2 displays instance attributes only when present in serialized data', () => {
      const code = 'my_dog = Dog(3)';
      const event: TraceEvent = {
        seq: 5,
        kind: 'line',
        line: 1,
        locals: {
          my_dog: { type: 'Dog', value: '<Dog object at 0x10a2>' },
        },
      };

      const card = computeVisualTeachingCard(event, code);

      expect(card.kind).toBe('assignment');
      expect(card.observed).toEqual([
        { name: 'my_dog', type: 'Dog', value: '<Dog object at 0x10a2>' },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Call, Return, and Exception events
  // ---------------------------------------------------------------------------
  describe('10. Call, Return, and Exception events', () => {
    it('10.1 handles function call event', () => {
      const event: TraceEvent = {
        seq: 1,
        kind: 'call',
        line: 2,
        name: 'greet',
        locals: { name: { type: 'str', value: "'Alice'" } },
      };

      const card = computeVisualTeachingCard(event);

      expect(card.kind).toBe('call');
      expect(card.titleTh).toContain('greet');
      expect(card.explanationTh).toContain('Call Stack');
    });

    it('10.2 handles function return event', () => {
      const event: TraceEvent = {
        seq: 2,
        kind: 'return',
        line: 3,
        name: 'add',
        text: '42',
        locals: {},
      };

      const card = computeVisualTeachingCard(event);

      expect(card.kind).toBe('return');
      expect(card.titleTh).toContain('add');
      expect(card.explanationTh).toContain('42');
      expect(card.misconceptionTh).toContain('return');
      expect(card.misconceptionTh).toContain('print()');
    });

    it('10.3 handles NameError exception specifically inspired by reel DeWxvupPQai', () => {
      const event: TraceEvent = {
        seq: 3,
        kind: 'exception',
        line: 4,
        text: "NameError: name 'y' is not defined",
        locals: { x: { type: 'int', value: '7' } },
      };

      const card = computeVisualTeachingCard(event, 'print(y)');

      expect(card.kind).toBe('exception');
      expect(card.titleTh).toContain('Exception');
      expect(card.explanationTh).toContain('NameError');
      expect(card.questionTh).toContain('กำหนดค่าไว้ก่อน');
      expect(card.misconceptionTh).toContain('NameError');
      expect(card.observed).toEqual([{ name: 'x', type: 'int', value: '7' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Bounded safety: max 6 locals truncation and no HTML
  // ---------------------------------------------------------------------------
  describe('11. Bounded safety & sanitization', () => {
    it('11.1 safely truncates locals to a maximum of 6 entries', () => {
      const manyLocals: Record<string, { type: string; value: string }> = {};
      for (let i = 1; i <= 10; i++) {
        manyLocals[`var_${i}`] = { type: 'int', value: `${i}` };
      }

      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: manyLocals,
      };

      const card = computeVisualTeachingCard(event, 'x = 1');

      expect(card.observed).toHaveLength(6);
      expect(card.observed.map((o) => o.name)).toEqual([
        'var_1',
        'var_2',
        'var_3',
        'var_4',
        'var_5',
        'var_6',
      ]);
    });

    it('11.2 strips HTML markup and produces plain text display', () => {
      const sanitized = sanitizeNoHtml('<script>alert("xss")</script><b>Hello</b>');
      expect(sanitized).toBe('alert("xss")Hello');

      const event: TraceEvent = {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {
          '<b>malicious</b>': { type: '<script>alert(1)</script>', value: '<span class="bad">10</span>' },
        },
      };

      const card = computeVisualTeachingCard(event, 'x = 1');

      // Values remain exact text; React escapes these instead of stripping recorded data.
      expect(card.observed[0].name).toBe('<b>malicious</b>');
      expect(card.observed[0].type).toBe('<script>alert(1)</script>');
      expect(card.observed[0].value).toBe('<span class="bad">10</span>');
    });

    it('11.3 preserves Python object representations without corrupting them', () => {
      const repr = '<Dog object at 0x7fa281>';
      const sanitized = sanitizeNoHtml(repr);
      expect(sanitized).toBe(repr);
    });
  });
});
