import React, { useEffect, useRef } from 'react';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, Decoration, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const pythonColors = HighlightStyle.define([
  { tag: tags.keyword, color: '#c586c0' },
  { tag: [tags.string, tags.special(tags.string)], color: '#ce9178' },
  { tag: [tags.number, tags.bool, tags.null], color: '#b5cea8' },
  { tag: tags.comment, color: '#6a9955' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.function(tags.definition(tags.variableName))], color: '#dcdcaa' },
  { tag: [tags.className, tags.typeName], color: '#4ec9b0' },
  { tag: [tags.variableName, tags.propertyName], color: '#9cdcfe' },
  { tag: [tags.operator, tags.punctuation], color: '#d4d4d4' },
]);
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { getLanguageService } from './languageBridge';

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  activeLine?: number;
  readOnly?: boolean;
}

// Effect และ Field สำหรับไฮไลต์บรรทัด execution trace
const setActiveLineEffect = StateEffect.define<number>();

const activeLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setActiveLineEffect)) {
        const lineNum = effect.value;
        if (lineNum <= 0 || lineNum > tr.state.doc.lines) {
          return Decoration.none;
        }
        const line = tr.state.doc.line(lineNum);
        return Decoration.set([
          Decoration.line({
            attributes: { class: 'cm-execution-line' },
          }).range(line.from),
        ]);
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  value,
  onChange,
  activeLine = 0,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const langService = getLanguageService();
    langService.init();

    // Autocomplete Source สำหรับ CodeMirror เชื่อมต่อกับ Language Service เดียวกัน
    const pythonCompletionSource = async (context: CompletionContext): Promise<CompletionResult | null> => {
      const word = context.matchBefore(/[\w.]*/);
      if (!word && !context.explicit) return null;

      const pos = context.pos;
      const line = context.state.doc.lineAt(pos);
      const lineNumber = line.number;
      const column = pos - line.from + 1;

      const code = context.state.doc.toString();
      const items = await langService.complete(code, lineNumber, column);

      return {
        from: word ? word.from : pos,
        options: items.map((it) => ({
          label: it.label,
          type: it.kind,
          detail: it.detail,
          apply: it.insertText || it.label,
        })),
      };
    };

    // Dark Theme เลียนแบบ VS Code Dark+
    const vsCodeTheme = EditorView.theme({
      '&': {
        color: '#d4d4d4',
        backgroundColor: '#1e1e1e',
        height: '100%',
        fontSize: '14px',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      },
      '.cm-content': {
        caretColor: '#aeafad',
        padding: '12px 0',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: '#aeafad',
      },
      '.cm-gutters': {
        backgroundColor: '#1e1e1e',
        color: '#858585',
        border: 'none',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
      },
      '.cm-execution-line': {
        backgroundColor: 'rgba(255, 215, 0, 0.22) !important',
        borderLeft: '3px solid #ffd54f',
      },
    });

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        python(),
        syntaxHighlighting(pythonColors),
        vsCodeTheme,
        keymap.of([...defaultKeymap, indentWithTab]),
        autocompletion({ override: [pythonCompletionSource] }),
        activeLineField,
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // ซิงค์เนื้อหาจากภายนอก
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  // ไฮไลต์บรรทัด execution line
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: setActiveLineEffect.of(activeLine),
      });
    }
  }, [activeLine]);

  return (
    <div
      ref={containerRef}
      className="codemirror-editor-wrapper"
      role="region"
      aria-label="CodeMirror Mobile Python Editor"
      style={{ width: '100%', height: '100%', minHeight: 0, overflow: 'hidden' }}
    />
  );
};
