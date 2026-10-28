import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
// @ts-ignore Monaco language definitions are JS-only public assets.
import { conf as pythonConf, language as pythonLanguage } from 'monaco-editor/languages/definitions/python/python';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/editor/contrib/parameterHints/browser/parameterHints';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/editor/contrib/folding/browser/folding';
import 'monaco-editor/editor/contrib/find/browser/findController';
import { setupMonacoEnvironment } from './monacoWorkerSetup';
import { getLanguageService } from './languageBridge';

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  activeLine?: number;
  readOnly?: boolean;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  onChange,
  activeLine = 0,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setupMonacoEnvironment();
    monaco.editor.defineTheme('playground-python', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' },
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'constant', foreground: 'B5CEA8' },
        { token: 'identifier', foreground: '9CDCFE' },
        { token: 'function', foreground: 'DCDCAA' },
        { token: 'type.identifier', foreground: '4EC9B0' },
      ],
      colors: { 'editor.background': '#1e1e1e', 'editor.foreground': '#d4d4d4' },
    });
    monaco.languages.register({ id: 'python' });
    monaco.languages.setLanguageConfiguration('python', pythonConf);
    monaco.languages.setMonarchTokensProvider('python', {
      ...pythonLanguage,
      // Python 3 print/exec are functions, not Python 2 statement keywords.
      keywords: pythonLanguage.keywords.filter((word: string) => word !== 'print' && word !== 'exec'),
      tokenizer: {
        ...pythonLanguage.tokenizer,
        root: [
          [/(class)(\s+)([A-Za-z_]\w*)/, ['keyword', 'white', 'type.identifier']],
          [/(def)(\s+)([A-Za-z_]\w*)/, ['keyword', 'white', 'function']],
          [/\b(?:True|False|None)\b/, 'constant'],
          [/[A-Za-z_]\w*(?=\s*\()/, { cases: { '@keywords': 'keyword', '@default': 'function' } }],
          ...pythonLanguage.tokenizer.root,
        ],
      },
    });
    const container = containerRef.current;
    if (!container) return;

    // ลงทะเบียน Language Providers สำหรับ Python
    const langService = getLanguageService();
    langService.init();

    // 1. Completion Provider
    const completionProvider = monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', ' ', '('],
      provideCompletionItems: async (model, position, _context, token) => {
        const version = model.getVersionId();
        const code = model.getValue();
        const items = await langService.complete(code, position.lineNumber, position.column);
        if (token.isCancellationRequested || model.isDisposed() || model.getVersionId() !== version) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: monaco.languages.CompletionItem[] = items.map((it) => {
          let kind = monaco.languages.CompletionItemKind.Function;
          if (it.kind === 'keyword') kind = monaco.languages.CompletionItemKind.Keyword;
          else if (it.kind === 'class') kind = monaco.languages.CompletionItemKind.Class;
          else if (it.kind === 'variable') kind = monaco.languages.CompletionItemKind.Variable;
          else if (it.kind === 'constant') kind = monaco.languages.CompletionItemKind.Constant;

          return {
            label: it.label,
            kind,
            detail: it.detail,
            insertText: it.insertText || it.label,
            range,
          };
        });

        return { suggestions };
      },
    });

    // 2. Signature Help Provider
    const signatureProvider = monaco.languages.registerSignatureHelpProvider('python', {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp: async (model, position) => {
        const code = model.getValue();
        const help = await langService.signature(code, position.lineNumber, position.column);
        if (!help) return null;

        const signatures: monaco.languages.SignatureInformation[] = [
          {
            label: help.label,
            documentation: help.documentation,
            parameters: (help.parameters || []).map((p) => ({
              label: p.label,
              documentation: p.documentation,
            })),
          },
        ];

        return {
          value: {
            signatures,
            activeSignature: 0,
            activeParameter: 0,
          },
          dispose: () => {},
        };
      },
    });

    // 3. Hover Provider
    const hoverProvider = monaco.languages.registerHoverProvider('python', {
      provideHover: async (model, position) => {
        const code = model.getValue();
        const hoverResult = await langService.hover(code, position.lineNumber, position.column);
        if (!hoverResult || hoverResult.contents.length === 0) return null;

        return {
          contents: hoverResult.contents.map((c) => ({ value: c })),
        };
      },
    });

    // สร้าง Monaco Editor Instance
    const editor = monaco.editor.create(container, {
      value,
      language: 'python',
      theme: 'playground-python',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
      tabSize: 4,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'all',
      readOnly,
      lineNumbers: 'on',
      folding: true,
      glyphMargin: true,
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      padding: { top: 12, bottom: 12 },
    });

    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection([]);
    // Prime Monaco's lexical tokens even before language-worker readiness.
    const primeTokens = () => {
      const model = editor.getModel();
      if (!model) return;
      const internal = model as typeof model & { tokenization?: { forceTokenization(line: number): void } };
      internal.tokenization?.forceTokenization(model.getLineCount());
    };
    const tokenFrame = requestAnimationFrame(primeTokens);

    const subscription = editor.onDidChangeModelContent(() => {
      primeTokens();
      onChangeRef.current(editor.getValue());
    });

    return () => {
      cancelAnimationFrame(tokenFrame);
      subscription.dispose();
      completionProvider.dispose();
      signatureProvider.dispose();
      hoverProvider.dispose();
      editor.dispose();
      editorRef.current = null;
      decorationsRef.current = null;
    };
  }, []);

  // ซิงค์ค่าเนื้อหาในกรณีเปลี่ยนจากภายนอก (เช่น กดเลือกตัวอย่าง)
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value);
    }
  }, [value]);

  // ไฮไลต์บรรทัดที่กำลังประมวลผล (Active Execution Line)
  useEffect(() => {
    if (!editorRef.current || !decorationsRef.current) return;

    if (activeLine > 0) {
      decorationsRef.current.set([
        {
          range: new monaco.Range(activeLine, 1, activeLine, 1),
          options: {
            isWholeLine: true,
            className: 'monaco-execution-line-highlight',
            glyphMarginClassName: 'monaco-execution-glyph-arrow',
          },
        },
      ]);
      editorRef.current.revealLineInCenterIfOutsideViewport(activeLine);
    } else {
      decorationsRef.current.clear();
    }
  }, [activeLine]);

  return (
    <div
      ref={containerRef}
      className="monaco-editor-wrapper"
      role="region"
      aria-label="Monaco Python Editor"
      style={{ width: '100%', height: '100%', minHeight: '300px' }}
    />
  );
};
