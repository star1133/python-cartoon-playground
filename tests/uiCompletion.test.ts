import { describe, it, expect } from 'vitest';
import {
  getPythonCompletions,
  getPythonSignatureHelp,
  getPythonHover,
  extractUserSymbols,
} from '../src/editor/staticPythonAnalyzer';
import { LanguageBridgeImpl } from '../src/editor/languageBridge';

describe('uiCompletion and staticPythonAnalyzer', () => {
  it('suggests "print" when user types "pri"', () => {
    const code = 'pri';
    const completions = getPythonCompletions(code, 1, 4);
    const printItem = completions.find((c) => c.label === 'print');
    expect(printItem).toBeDefined();
    expect(printItem?.kind).toBe('function');
  });

  it('suggests module members after dot e.g. "math."', () => {
    const code = 'import math\nmath.';
    const completions = getPythonCompletions(code, 2, 6);
    const sqrtItem = completions.find((c) => c.label === 'sqrt');
    const piItem = completions.find((c) => c.label === 'pi');
    expect(sqrtItem).toBeDefined();
    expect(piItem).toBeDefined();
  });

  it('suggests playground_world exports e.g. "move_forward"', () => {
    const code = 'from playground_world import \nmove';
    const completions = getPythonCompletions(code, 2, 5);
    const moveItem = completions.find((c) => c.label === 'move_forward');
    expect(moveItem).toBeDefined();
    expect(moveItem?.detail).toContain('playground_world');
  });

  it('extracts declared user functions, classes and variables', () => {
    const code = [
      'def solve_puzzle(steps):',
      '    pass',
      '',
      'class Explorer:',
      '    pass',
      '',
      'hero_hp = 100',
    ].join('\n');

    const symbols = extractUserSymbols(code);
    expect(symbols.some((s) => s.label === 'solve_puzzle' && s.kind === 'function')).toBe(true);
    expect(symbols.some((s) => s.label === 'Explorer' && s.kind === 'class')).toBe(true);
    expect(symbols.some((s) => s.label === 'hero_hp' && s.kind === 'variable')).toBe(true);
  });

  it('provides signature help when typing opening parenthesis', () => {
    const code = 'print(';
    const sigHelp = getPythonSignatureHelp(code, 1, 7);
    expect(sigHelp).not.toBeNull();
    expect(sigHelp?.label).toContain('print(');
    expect(sigHelp?.documentation).toContain('stdout');
  });

  it('returns hover documentation with Thai explanations', () => {
    const code = 'move_forward()';
    const hover = getPythonHover(code, 1, 5);
    expect(hover).not.toBeNull();
    expect(hover?.contents[0]).toContain('move_forward');
    expect(hover?.contents[0]).toContain('ก้าวไปข้างหน้า');
  });

  it('maps sibling client string signature to structured SignatureHelpInfo object', async () => {
    const mockSibling = {
      init: async () => {},
      signature: async () => 'calculate_score(points, multiplier=1)',
      hover: async () => 'Returns total score as int',
      complete: async () => [{ label: 'calculate_score', kind: 'function' }],
      dispose: () => {},
    };

    const bridge = new LanguageBridgeImpl(mockSibling);
    await bridge.init();
    expect(bridge.getStatus()).toBe('ready');

    const sig = await bridge.signature('calculate_score(', 1, 16);
    expect(sig).not.toBeNull();
    expect(sig?.label).toBe('calculate_score(points, multiplier=1)');
    expect(sig?.parameters).toHaveLength(2);
    expect(sig?.parameters?.[0].label).toBe('points');
    expect(sig?.parameters?.[1].label).toBe('multiplier=1');
  });

  it('maps sibling client string hover to structured HoverInfo object', async () => {
    const mockSibling = {
      init: async () => {},
      signature: async () => '',
      hover: async () => 'Built-in hero explorer object',
      complete: async () => [],
      dispose: () => {},
    };

    const bridge = new LanguageBridgeImpl(mockSibling);
    await bridge.init();

    const hover = await bridge.hover('hero', 1, 4);
    expect(hover).not.toBeNull();
    expect(hover?.contents).toEqual(['Built-in hero explorer object']);
  });

  it('sets status to "fallback" instead of faking "ready" when worker init fails', async () => {
    const failingSibling = {
      init: async () => {
        throw new Error('Worker script not found in offline environment');
      },
      dispose: () => {},
    };

    const bridge = new LanguageBridgeImpl(failingSibling);
    await bridge.init();

    // MUST NOT fake 'ready'
    expect(bridge.getStatus()).toBe('fallback');

    // Still successfully returns completions via static analyzer fallback
    const completions = await bridge.complete('pri', 1, 4);
    expect(completions.some((c) => c.label === 'print')).toBe(true);
  });
});
