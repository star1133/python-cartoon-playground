const KEY = 'python-replay-persistence-opt-in';
export function loadReplayPersistencePreference(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function saveReplayPersistencePreference(enabled: boolean): void {
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* Memory replay still available. */ }
}
