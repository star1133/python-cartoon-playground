import type { Completion } from '../runtime/types';
import {
  getPythonCompletions,
  getPythonSignatureHelp,
  getPythonHover,
} from './staticPythonAnalyzer';

export interface SignatureHelpInfo {
  label: string;
  documentation?: string;
  parameters?: { label: string; documentation?: string }[];
}

export interface HoverInfo {
  contents: string[];
}

export interface LanguageService {
  init(): Promise<void>;
  complete(code: string, line: number, column: number): Promise<Completion[]>;
  signature(code: string, line: number, column: number): Promise<SignatureHelpInfo | null>;
  hover(code: string, line: number, column: number): Promise<HoverInfo | null>;
  dispose(): void;
  getStatus(): 'initializing' | 'ready' | 'fallback' | 'error';
}

export class LanguageBridgeImpl implements LanguageService {
  private siblingClient: any = null;
  private status: 'initializing' | 'ready' | 'fallback' | 'error' = 'initializing';

  constructor(siblingClient?: any) {
    if (siblingClient) {
      this.siblingClient = siblingClient;
    }
  }

  async init(): Promise<void> {
    try {
      if (!this.siblingClient) {
        // @ts-ignore
        const mod = await import('../runtime/languageClient');
        if (mod && typeof mod.createLanguageClient === 'function') {
          this.siblingClient = mod.createLanguageClient();
        }
      }

      if (this.siblingClient && typeof this.siblingClient.init === 'function') {
        await this.siblingClient.init();
        this.status = 'ready';
        return;
      }
    } catch (err) {
      // Sibling language worker initialization failed; do not fake 'ready'
      console.warn('Language worker initialization failed, engaging static fallback:', err);
      this.status = 'fallback';
      return;
    }

    // Static Python Analyzer fallback is always available
    this.status = 'fallback';
  }

  async complete(code: string, line: number, column: number): Promise<Completion[]> {
    if (this.siblingClient && typeof this.siblingClient.complete === 'function') {
      try {
        const results = await this.siblingClient.complete(code, line, column);
        if (Array.isArray(results) && results.length > 0) {
          return results;
        }
      } catch (err) {
        console.warn('Sibling languageClient complete error:', err);
      }
    }
    return getPythonCompletions(code, line, column);
  }

  async signature(code: string, line: number, column: number): Promise<SignatureHelpInfo | null> {
    if (this.siblingClient && typeof this.siblingClient.signature === 'function') {
      try {
        const sig = await this.siblingClient.signature(code, line, column);
        if (sig) {
          if (typeof sig === 'string') {
            const paramMatch = sig.match(/\((.*?)\)/);
            const parameters = paramMatch && paramMatch[1].trim()
              ? paramMatch[1].split(',').map((p) => ({ label: p.trim() }))
              : [];
            return {
              label: sig,
              parameters,
            };
          }
          if (typeof sig === 'object' && sig.label) {
            return sig;
          }
        }
      } catch (err) {
        console.warn('Sibling signature error:', err);
      }
    }
    return getPythonSignatureHelp(code, line, column);
  }

  async hover(code: string, line: number, column: number): Promise<HoverInfo | null> {
    if (this.siblingClient && typeof this.siblingClient.hover === 'function') {
      try {
        const h = await this.siblingClient.hover(code, line, column);
        if (h) {
          if (typeof h === 'string') {
            return { contents: [h] };
          }
          if (typeof h === 'object' && Array.isArray((h as any).contents)) {
            return h;
          }
        }
      } catch (err) {
        console.warn('Sibling hover error:', err);
      }
    }
    return getPythonHover(code, line, column);
  }

  dispose(): void {
    if (this.siblingClient && typeof this.siblingClient.dispose === 'function') {
      this.siblingClient.dispose();
      this.siblingClient = null;
    }
    this.status = 'fallback';
  }

  getStatus(): 'initializing' | 'ready' | 'fallback' | 'error' {
    return this.status;
  }
}

let singletonService: LanguageService | null = null;

export function getLanguageService(): LanguageService {
  if (!singletonService) {
    singletonService = new LanguageBridgeImpl();
  }
  return singletonService;
}
