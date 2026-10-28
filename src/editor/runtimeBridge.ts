import type { RuntimeCallbacks, RuntimeClient } from '../runtime/types';
import { createRuntimeClient as createRealRuntimeClient } from '../runtime/client';
/** Only real Pyodide execution is permitted. Fail visibly, never simulate. */
export async function createRuntimeClient(callbacks: RuntimeCallbacks): Promise<RuntimeClient> {
  return createRealRuntimeClient(callbacks);
}
