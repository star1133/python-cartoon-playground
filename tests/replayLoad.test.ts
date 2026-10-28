import { describe,it,expect } from 'vitest';
import { playbackReducer,INITIAL_PLAYBACK_STATE } from '../src/editor/playbackReducer';
describe('explicit cached replay loading',()=>{
 it('loads immutable recorded events paused without starting execution',()=>{
  const events=[{seq:1,kind:'line',line:1,locals:{value:{type:'int',value:'7'}}}];
  const state=playbackReducer({...INITIAL_PLAYBACK_STATE,currentCode:'value = 7'},{type:'REPLAY_LOAD',code:'value = 7',events});
  expect(state.status).toBe('paused');expect(state.executionStatus).toBe('done');expect(state.isExecutionDone).toBe(true);expect(state.isPlaying).toBe(false);
  expect(state.activeLocals.value.value).toBe('7');expect(state.events).not.toBe(events);
 });
 it('never highlights stale edited source and keeps error record readable',()=>{
  const state=playbackReducer({...INITIAL_PLAYBACK_STATE,currentCode:'changed'},{type:'REPLAY_LOAD',code:'original',events:[{seq:1,kind:'exception',line:3,text:'NameError'}],error:'NameError'});
  expect(state.activeLine).toBe(0);expect(state.errorMessage).toBe('NameError');expect(state.status).toBe('paused');
 });
});
