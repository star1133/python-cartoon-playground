import React, { useRef } from 'react';
export const PANEL_SPLIT_KEY = 'python-right-panel-split-v1';
export function clampPanelSplit(value: number): number { return Number.isFinite(value) ? Math.min(80, Math.max(20, value)) : 60; }
export function loadPanelSplit(): number {
  try { const raw = localStorage.getItem(PANEL_SPLIT_KEY); return raw === null ? 60 : clampPanelSplit(Number(raw)); } catch { return 60; }
}
export function PanelResizeHandle({value,onChange}:{value:number;onChange:(value:number)=>void}) {
  const pointer = useRef<number | null>(null);
  const change=(next:number)=>{ const bounded=clampPanelSplit(next);onChange(bounded);try{localStorage.setItem(PANEL_SPLIT_KEY,String(bounded));}catch{} };
  const move=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(pointer.current!==e.pointerId)return;
    const rect=e.currentTarget.parentElement?.getBoundingClientRect();
    if(rect?.height)change((e.clientY-rect.top)/rect.height*100);
  };
  const release=(e:React.PointerEvent<HTMLDivElement>)=>{pointer.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
  return <div className="panel-resize-handle" role="separator" aria-label="ปรับขนาดกระดานและแผงผลลัพธ์" aria-orientation="horizontal"
    aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(value)} aria-valuetext={`กระดาน ${Math.round(value)} เปอร์เซ็นต์`}
    aria-controls="animation-panel result-panel" tabIndex={0} title="ลากขึ้น/ลงเพื่อปรับขนาด • ลูกศรปรับ • ดับเบิลคลิกคืนค่า"
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);move(e);}}
    onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={()=>{pointer.current=null;}}
    onDoubleClick={()=>change(60)} onKeyDown={e=>{const step=e.shiftKey?10:2;const next=e.key==='ArrowUp'?value-step:e.key==='ArrowDown'?value+step:e.key==='Home'?20:e.key==='End'?80:e.key==='Enter'?60:null;if(next!==null){e.preventDefault();change(next);}}}>
    <span aria-hidden="true" />
  </div>;
}
