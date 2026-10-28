export function prefersMobileLayout(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 768 || (window.innerWidth <= 1024 && window.matchMedia('(pointer: coarse)').matches);
}
