import type { Value } from '../runtime/types';

export interface ContainerElement {
  key?: string;
  index?: number;
  value: string;
}

export interface ParsedValueInfo {
  type: string;
  displayType: string;
  fullValue: string;
  preview: string;
  isContainer: boolean;
  containerType: 'primitive' | 'list' | 'tuple' | 'dict' | 'set' | 'object' | 'function';
  elements: ContainerElement[];
  totalElementsCount?: number;
  hasMore: boolean;
}

/**
 * Truncate a string safely with an ellipsis.
 */
export function truncateString(str: string, maxLen = 22): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 3)) + '...';
}

/**
 * Safely parse top-level comma-separated entries inside brackets/braces without eval.
 */
function splitTopLevelEntries(content: string, maxItems = 6): { items: string[]; hasOmitted: boolean } {
  const items: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let current = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuote) {
      current += char;
      if (char === inQuote && content[i - 1] !== '\\') {
        inQuote = null;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
      current += char;
    } else if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        if (trimmed === '...') {
          return { items, hasOmitted: true };
        }
        items.push(trimmed);
        if (items.length >= maxItems) {
          return { items, hasOmitted: true };
        }
      }
      current = '';
    } else {
      current += char;
    }
  }

  const finalTrimmed = current.trim();
  if (finalTrimmed) {
    if (finalTrimmed === '...') {
      return { items, hasOmitted: true };
    }
    items.push(finalTrimmed);
  }

  return { items, hasOmitted: false };
}

/**
 * Parse safe serialized Python Value into structured representation.
 * GUARANTEE: Zero eval(), zero dynamic code execution, pure static token analysis.
 */
export function parseSafeValue(val: Value | undefined | null): ParsedValueInfo {
  if (!val) {
    return {
      type: 'NoneType',
      displayType: 'None',
      fullValue: 'None',
      preview: 'None',
      isContainer: false,
      containerType: 'primitive',
      elements: [],
      hasMore: false,
    };
  }

  const type = val.type || 'unknown';
  const raw = val.value || '';

  // 1. List
  if (type === 'list' && raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) {
      return {
        type,
        displayType: 'list[0]',
        fullValue: raw,
        preview: '[]',
        isContainer: true,
        containerType: 'list',
        elements: [],
        totalElementsCount: 0,
        hasMore: false,
      };
    }
    const { items, hasOmitted } = splitTopLevelEntries(inner, 6);
    const elements: ContainerElement[] = items.map((item, idx) => ({
      index: idx,
      value: truncateString(item, 18),
    }));
    return {
      type,
      displayType: `list[${elements.length}${hasOmitted ? '+' : ''}]`,
      fullValue: raw,
      preview: truncateString(raw, 26),
      isContainer: true,
      containerType: 'list',
      elements,
      totalElementsCount: elements.length,
      hasMore: hasOmitted,
    };
  }

  // 2. Tuple
  if (type === 'tuple' && raw.startsWith('(') && raw.endsWith(')')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) {
      return {
        type,
        displayType: 'tuple[0]',
        fullValue: raw,
        preview: '()',
        isContainer: true,
        containerType: 'tuple',
        elements: [],
        totalElementsCount: 0,
        hasMore: false,
      };
    }
    const { items, hasOmitted } = splitTopLevelEntries(inner, 6);
    const elements: ContainerElement[] = items.map((item, idx) => ({
      index: idx,
      value: truncateString(item, 18),
    }));
    return {
      type,
      displayType: `tuple[${elements.length}${hasOmitted ? '+' : ''}]`,
      fullValue: raw,
      preview: truncateString(raw, 26),
      isContainer: true,
      containerType: 'tuple',
      elements,
      totalElementsCount: elements.length,
      hasMore: hasOmitted,
    };
  }

  // 3. Dict
  if (type === 'dict' && raw.startsWith('{') && raw.endsWith('}')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) {
      return {
        type,
        displayType: 'dict[0]',
        fullValue: raw,
        preview: '{}',
        isContainer: true,
        containerType: 'dict',
        elements: [],
        totalElementsCount: 0,
        hasMore: false,
      };
    }
    const { items, hasOmitted } = splitTopLevelEntries(inner, 6);
    const elements: ContainerElement[] = items.map((entry) => {
      const colonIdx = entry.indexOf(':');
      if (colonIdx !== -1) {
        const k = entry.slice(0, colonIdx).trim();
        const v = entry.slice(colonIdx + 1).trim();
        return { key: truncateString(k, 12), value: truncateString(v, 14) };
      }
      return { value: truncateString(entry, 18) };
    });
    return {
      type,
      displayType: `dict[${elements.length}${hasOmitted ? '+' : ''}]`,
      fullValue: raw,
      preview: truncateString(raw, 26),
      isContainer: true,
      containerType: 'dict',
      elements,
      totalElementsCount: elements.length,
      hasMore: hasOmitted,
    };
  }

  // 4. Set
  if (type === 'set' && ((raw.startsWith('{') && raw.endsWith('}')) || raw === 'set()')) {
    if (raw === 'set()') {
      return {
        type,
        displayType: 'set[0]',
        fullValue: raw,
        preview: 'set()',
        isContainer: true,
        containerType: 'set',
        elements: [],
        totalElementsCount: 0,
        hasMore: false,
      };
    }
    const inner = raw.slice(1, -1).trim();
    const { items, hasOmitted } = splitTopLevelEntries(inner, 6);
    const elements: ContainerElement[] = items.map((item, idx) => ({
      index: idx,
      value: truncateString(item, 18),
    }));
    return {
      type,
      displayType: `set[${elements.length}${hasOmitted ? '+' : ''}]`,
      fullValue: raw,
      preview: truncateString(raw, 26),
      isContainer: true,
      containerType: 'set',
      elements,
      totalElementsCount: elements.length,
      hasMore: hasOmitted,
    };
  }

  // 5. Function / Method
  if (type === 'function' || type === 'builtin_function_or_method' || raw.startsWith('<function ')) {
    const fnMatch = raw.match(/<function\s+([^>]+)>/);
    const fnName = fnMatch ? fnMatch[1] : 'fn';
    return {
      type: 'function',
      displayType: 'def',
      fullValue: raw,
      preview: `ƒ ${truncateString(fnName ?? 'fn', 18)}()`,
      isContainer: false,
      containerType: 'function',
      elements: [],
      hasMore: false,
    };
  }

  // 6. Custom Class Object / Instance
  if (raw.startsWith('<') && raw.endsWith('>')) {
    const objMatch = raw.match(/<([a-zA-Z0-9_.]+)\s+object\s+at\s+([^>]+)>/);
    if (objMatch) {
      const clsName = objMatch[1]?.split('.').pop() || 'Object';
      const idStr = objMatch[2] ? objMatch[2].slice(-4) : '';
      return {
        type: clsName,
        displayType: `class ${clsName}`,
        fullValue: raw,
        preview: `<${clsName} #${idStr}>`,
        isContainer: false,
        containerType: 'object',
        elements: [],
        hasMore: false,
      };
    }
  }

  // 7. Primitives
  return {
    type,
    displayType: type,
    fullValue: raw,
    preview: truncateString(raw, 26),
    isContainer: false,
    containerType: 'primitive',
    elements: [],
    hasMore: false,
  };
}
