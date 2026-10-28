/**
 * sharedControl.ts
 * SharedArrayBuffer memory layout and synchronization protocol for Pyodide execution.
 * Layout:
 * - Bytes 0..3: Interrupt buffer (Int32Array[0]): 0 = normal, 2 = SIGINT (KeyboardInterrupt)
 * - Bytes 4..7: Input status (Int32Array[1]): 0 = waiting, 1 = input ready, 2 = cancelled
 * - Bytes 8..11: Input byte length (Int32Array[2])
 * - Bytes 16..65535: Input data UTF-8 bytes (Uint8Array)
 */

export const INTERRUPT_INDEX = 0;
export const INPUT_STATUS_INDEX = 1;
export const INPUT_LENGTH_INDEX = 2;
export const DATA_OFFSET_BYTES = 16;
export const BUFFER_SIZE = 65536;

export interface SharedControl {
  sab: SharedArrayBuffer;
  interruptBuffer: Int32Array;
  controlInt32: Int32Array;
  dataBuffer: Uint8Array;
}

export function isSharedArrayBufferSupported(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof Atomics !== 'undefined' &&
    typeof crossOriginIsolated !== 'undefined' &&
    crossOriginIsolated
  );
}

export function createSharedControl(): SharedControl | null {
  if (!isSharedArrayBufferSupported()) {
    return null;
  }
  try {
    const sab = new SharedArrayBuffer(BUFFER_SIZE);
    const controlInt32 = new Int32Array(sab, 0, 4);
    // interruptBuffer covers index 0 for pyodide.setInterruptBuffer
    const interruptBuffer = new Int32Array(sab, 0, 1);
    const dataBuffer = new Uint8Array(sab, DATA_OFFSET_BYTES);

    Atomics.store(controlInt32, INTERRUPT_INDEX, 0);
    Atomics.store(controlInt32, INPUT_STATUS_INDEX, 0);
    Atomics.store(controlInt32, INPUT_LENGTH_INDEX, 0);

    return { sab, interruptBuffer, controlInt32, dataBuffer };
  } catch (err) {
    console.warn('Failed to allocate SharedArrayBuffer:', err);
    return null;
  }
}

export function signalInterrupt(sab: SharedArrayBuffer): void {
  const control = new Int32Array(sab, 0, 4);
  Atomics.store(control, INTERRUPT_INDEX, 2);
  // Wake up any thread waiting on input
  Atomics.store(control, INPUT_STATUS_INDEX, 2);
  Atomics.notify(control, INPUT_STATUS_INDEX);
}

export function clearInterrupt(sab: SharedArrayBuffer): void {
  const control = new Int32Array(sab, 0, 4);
  Atomics.store(control, INTERRUPT_INDEX, 0);
}

export function writeSharedInput(sab: SharedArrayBuffer, text: string): boolean {
  try {
    const control = new Int32Array(sab, 0, 4);
    const data = new Uint8Array(sab, DATA_OFFSET_BYTES);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);

    const maxBytes = BUFFER_SIZE - DATA_OFFSET_BYTES;
    const writeLen = Math.min(encoded.length, maxBytes);
    data.set(encoded.subarray(0, writeLen));

    Atomics.store(control, INPUT_LENGTH_INDEX, writeLen);
    Atomics.store(control, INPUT_STATUS_INDEX, 1);
    Atomics.notify(control, INPUT_STATUS_INDEX);
    return true;
  } catch (err) {
    console.error('Error writing to SharedArrayBuffer:', err);
    return false;
  }
}

export function readSharedInputWorker(
  sab: SharedArrayBuffer,
  timeoutMs = 150,
  shouldInterrupt?: () => boolean
): string | null {
  const control = new Int32Array(sab, 0, 4);
  const data = new Uint8Array(sab, DATA_OFFSET_BYTES);
  const decoder = new TextDecoder();

  while (true) {
    if (shouldInterrupt && shouldInterrupt()) {
      return null;
    }
    if (Atomics.load(control, INTERRUPT_INDEX) === 2) {
      return null;
    }

    const status = Atomics.load(control, INPUT_STATUS_INDEX);
    if (status === 1) {
      // Input ready
      const len = Atomics.load(control, INPUT_LENGTH_INDEX);
      const text = decoder.decode(data.slice(0, len));
      // Reset status
      Atomics.store(control, INPUT_STATUS_INDEX, 0);
      Atomics.store(control, INPUT_LENGTH_INDEX, 0);
      return text;
    }
    if (status === 2) {
      // Cancelled
      Atomics.store(control, INPUT_STATUS_INDEX, 0);
      return null;
    }

    // Wait bounded time
    Atomics.wait(control, INPUT_STATUS_INDEX, 0, timeoutMs);
  }
}
