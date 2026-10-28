let isConfigured = false;

export function setupMonacoEnvironment(): void {
  if (isConfigured || typeof window === 'undefined') return;

  try {
    // @ts-ignore
    window.MonacoEnvironment = {
      globalAPI: true,
      getWorker(_moduleId: string, _label: string): Worker {
        return new Worker(
          new URL('../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
          { type: 'module' }
        );
      },
    };
    isConfigured = true;
  } catch (err) {
    console.warn('MonacoEnvironment worker initialization warning:', err);
  }
}
