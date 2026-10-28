import { describe, it, expect } from 'vitest';
import { explainTraceEvent } from '../src/explain/thaiExplainer';
import type { TraceEvent } from '../src/runtime/types';

describe('thaiExplainer', () => {
  it('explains world move_forward event correctly', () => {
    const event: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 3,
      world: { x: 2, y: 0, direction: 0, action: 'move_forward' },
    };
    const explanation = explainTraceEvent(event);
    expect(explanation).toContain('ก้าวไปข้างหน้า');
    expect(explanation).toContain('(2, 0)');
  });

  it('explains world turn_left and turn_right events', () => {
    const turnLeft: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 4,
      world: { x: 2, y: 0, direction: 3, action: 'turn_left' },
    };
    expect(explainTraceEvent(turnLeft)).toContain('หมุนไปทางซ้าย');
    expect(explainTraceEvent(turnLeft)).toContain('เหนือ');

    const turnRight: TraceEvent = {
      seq: 3,
      kind: 'line',
      line: 5,
      world: { x: 2, y: 0, direction: 1, action: 'turn_right' },
    };
    expect(explainTraceEvent(turnRight)).toContain('หมุนไปทางขวา');
    expect(explainTraceEvent(turnRight)).toContain('ใต้');
  });

  it('explains function calls and returns', () => {
    const callEvent: TraceEvent = {
      seq: 4,
      kind: 'call',
      line: 10,
      name: 'factorial',
    };
    expect(explainTraceEvent(callEvent)).toContain('factorial');
    expect(explainTraceEvent(callEvent)).toContain('Stack');

    const returnEvent: TraceEvent = {
      seq: 5,
      kind: 'return',
      line: 15,
      name: 'factorial',
      text: '120',
    };
    expect(explainTraceEvent(returnEvent)).toContain('factorial');
    expect(explainTraceEvent(returnEvent)).toContain('คืนค่า');
  });

  it('explains python source lines accurately with pre-line phrasing', () => {
    const code = [
      'for step in range(4):',
      '    x = 10',
      '    print(x)',
    ].join('\n');

    const forEvent: TraceEvent = { seq: 1, kind: 'line', line: 1 };
    expect(explainTraceEvent(forEvent, code)).toContain('วนลูป');

    // Pre-line phrasing: กำลังตั้งค่า (ADHD format)
    const assignEvent: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 2,
      locals: { x: { type: 'int', value: '10' } },
    };
    const assignExpl = explainTraceEvent(assignEvent, code);
    expect(assignExpl).toContain('x');

    const printEvent: TraceEvent = { seq: 3, kind: 'line', line: 3 };
    expect(explainTraceEvent(printEvent, code)).toContain('แสดงผล');
  });

  it('explains completed assignment faithfully from diff of subsequent event', () => {
    const code = [
      'x = 10',
      'y = 20',
      'total = x + y',
    ].join('\n');

    const event1: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 1,
      locals: {},
    };
    // At line 1: before x is assigned
    const expl1 = explainTraceEvent(event1, code);
    expect(expl1).toContain('x');
    expect(expl1).not.toContain('✅');

    // At line 2: x is now in locals (diff: x became 10), line 2 is about to assign y
    const event2: TraceEvent = {
      seq: 2,
      kind: 'line',
      line: 2,
      locals: { x: { type: 'int', value: '10' } },
    };
    const expl2 = explainTraceEvent(event2, code, event1);
    expect(expl2).toContain('x');
    expect(expl2).toContain('10');
    expect(expl2).toContain('y');
  });

  it('honors preexisting runtime explanation if present', () => {
    const event: TraceEvent = {
      seq: 1,
      kind: 'line',
      line: 2,
      explanation: 'คำอธิบายพิเศษจากระบบทดสอบ',
    };
    expect(explainTraceEvent(event)).toBe('คำอธิบายพิเศษจากระบบทดสอบ');
  });
});
