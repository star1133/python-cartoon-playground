/// <reference types="vite/client" />
import type { UserConfig as _ViteUserConfig } from 'vite';

declare module 'vite' {
  interface UserConfig {
    test?: any;
  }
}

declare module 'monaco-editor/esm/vs/editor/editor.worker.js?worker' {
  const workerFactory: new () => Worker;
  export default workerFactory;
}

declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  const workerFactory: new () => Worker;
  export default workerFactory;
}

declare module '/runtime/*' {
  const content: any;
  export default content;
  export const loadPyodide: any;
}

declare module '*/pyodide.mjs' {
  export const loadPyodide: any;
  const def: any;
  export default def;
}
