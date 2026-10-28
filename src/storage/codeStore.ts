import { EXAMPLES } from './examples';

const STORAGE_KEY = 'python_playground_draft_code';
const RUN_SNAPSHOT_KEY = 'python_playground_run_snapshot';

function getLocalStorage(): Storage | undefined {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return undefined;
}

function getSessionStorage(): Storage | undefined {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage;
  }
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage;
  }
  return undefined;
}

/**
 * ดึงโค้ดที่บันทึกไว้ในเบราว์เซอร์ ถ้าไม่มีให้คืนค่าตัวอย่างแรก (world_loop)
 */
export function loadSavedCode(): string {
  try {
    const storage = getLocalStorage();
    if (storage) {
      const saved = storage.getItem(STORAGE_KEY);
      if (saved && saved.trim().length > 0) {
        return saved;
      }
    }
  } catch (err) {
    console.warn('Cannot read from localStorage:', err);
  }
  return EXAMPLES[0]?.code ?? '';
}

/**
 * บันทึกโค้ดลง localStorage
 */
export function saveCode(code: string): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, code);
    }
  } catch (err) {
    console.warn('Cannot save to localStorage:', err);
  }
}

/**
 * ส่งออกโค้ดเป็นไฟล์ .py ดาวน์โหลดลงเครื่องของผู้ใช้
 */
export function exportCodeAsFile(code: string, filename = 'playground_script.py'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([code], { type: 'text/x-python;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * นำเข้าไฟล์ .py จาก File input
 */
export async function readImportedFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('ไม่สามารถอ่านเนื้อหาไฟล์เป็นข้อความได้'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('เกิดข้อผิดพลาดในการอ่านไฟล์'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * บันทึก snapshot ของโค้ดที่กำลังถูกรันจริง
 */
export function saveRunSnapshot(code: string): { code: string; timestamp: number } {
  const snapshot = { code, timestamp: Date.now() };
  try {
    const storage = getSessionStorage();
    if (storage) {
      storage.setItem(RUN_SNAPSHOT_KEY, JSON.stringify(snapshot));
    }
  } catch (err) {
    console.warn('Cannot save run snapshot:', err);
  }
  return snapshot;
}

/**
 * ตรวจสอบว่าโค้ดปัจจุบันในเอดิเตอร์เปลี่ยนไปจาก snapshot ที่กำลังรันหรือไม่
 */
export function isCodeModifiedFromSnapshot(currentCode: string, snapshotCode?: string): boolean {
  if (snapshotCode === undefined) return false;
  return currentCode !== snapshotCode;
}
