import { describe, it, expect } from 'vitest';
import { explainWhyEvent } from '../src/explain/whyExplainer';
import type { TraceEvent } from '../src/runtime/types';

function mkEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    seq: 1, kind: 'line', line: 1, name: '', text: '',
    locals: {}, globals: {}, callStack: [],
    ...overrides,
  } as unknown as TraceEvent;
}

describe('explainWhyEvent', () => {
  it('returns null when no match', () => {
    expect(explainWhyEvent(mkEvent({ kind: 'line', line: 99 }))).toBeNull();
  });

  it('explains assignment — new variable', () => {
    const event = mkEvent({ kind: 'line', line: 1, locals: { x: { value: '5', type: 'int' } } as never });
    const why = explainWhyEvent(event, 'x = 5', null);
    expect(why).toContain('object');
    expect(why).toContain('x');
    expect(why).toContain('5');
  });

  it('explains assignment — reassignment', () => {
    const prev = mkEvent({ kind: 'line', line: 1, locals: { x: { value: '3', type: 'int' } } as never });
    const event = mkEvent({ kind: 'line', line: 1, locals: { x: { value: '7', type: 'int' } } as never });
    const why = explainWhyEvent(event, 'x = 7', prev);
    expect(why).toContain('3');
    expect(why).toContain('7');
  });

  it('explains call', () => {
    const event = mkEvent({ kind: 'call', name: 'greet' });
    const why = explainWhyEvent(event);
    expect(why).toContain('greet');
    expect(why).toContain('Stack');
  });

  it('explains return', () => {
    const event = mkEvent({ kind: 'return', name: 'factorial', text: '6' });
    const why = explainWhyEvent(event);
    expect(why).toContain('factorial');
    expect(why).toContain('6');
  });

  it('explains exception', () => {
    const event = mkEvent({ kind: 'exception', text: 'ZeroDivisionError' });
    const why = explainWhyEvent(event);
    expect(why).toContain('Exception');
  });

  it('explains for loop', () => {
    const why = explainWhyEvent(mkEvent({ kind: 'line', line: 1 }), 'for i in range(5):');
    expect(why).toContain('iterable');
  });

  it('explains if condition', () => {
    const why = explainWhyEvent(mkEvent({ kind: 'line', line: 1 }), 'if x > 0:');
    expect(why).toContain('Boolean');
  });

  it('explains return statement', () => {
    const why = explainWhyEvent(mkEvent({ kind: 'line', line: 1 }), 'return result');
    expect(why).toContain('return');
  });
});
