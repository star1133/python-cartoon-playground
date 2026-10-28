import { describe, it, expect } from 'vitest';
import { createSceneReplayCache } from '../src/scene/sceneReplayCache';
import { reduceSceneStateHistory } from '../src/scene/sceneReducer';
import type { TraceEvent } from '../src/runtime/types';
const events: TraceEvent[] = Array.from({length: 180}, (_, i) => ({seq:i,kind:'line',line:i%8+1,locals:{count:{type:'int',value:String(i)}},stack:['<module>']}));
describe('scene replay checkpoints', () => {
 it('matches full reconstruction forward and backward', () => {
  const cache=createSceneReplayCache();
  for(const index of [0,40,100,20,179,150,0,-1]) expect(cache.get(events,index)).toEqual(reduceSceneStateHistory(events,index));
 });
 it('is bounded and resets for another trace', () => {
  const cache=createSceneReplayCache(1,4);
  cache.get(events,179);expect(cache.checkpointCount).toBeLessThanOrEqual(4);
  const other=[{seq:1,kind:'line',line:1,locals:{name:{type:'str',value:"'ใหม่'"}}}];
  expect(cache.get(other,0)).toEqual(reduceSceneStateHistory(other,0));
  cache.clear();expect(cache.checkpointCount).toBe(0);
 });
 it('supports append without stale results', () => {
  const cache=createSceneReplayCache();cache.get(events.slice(0,50),49);
  expect(cache.get(events,150)).toEqual(reduceSceneStateHistory(events,150));
 });
});
