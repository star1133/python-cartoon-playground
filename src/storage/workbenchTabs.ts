export type ResultTab = 'console' | 'variables' | 'callstack';
export type MobileTab = 'editor' | 'scene' | 'console' | 'inspector';
const KEY = 'python-workbench-tabs-v1';
export function loadWorkbenchTabs(): {result: ResultTab; mobile: MobileTab} {
  const defaults = {result: 'console' as ResultTab, mobile: 'editor' as MobileTab};
  try {
    const item = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (item?.version !== 1) return defaults;
    return {
      result: ['console','variables','callstack'].includes(item.result) ? item.result : defaults.result,
      mobile: ['editor','scene','console','inspector'].includes(item.mobile) ? item.mobile : defaults.mobile,
    };
  } catch { return defaults; }
}
export function saveWorkbenchTabs(result: ResultTab, mobile: MobileTab): void {
  try { localStorage.setItem(KEY, JSON.stringify({version:1,result,mobile})); } catch { /* Private browser/full storage still works. */ }
}
