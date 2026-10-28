import {afterEach, describe, it, expect, vi} from 'vitest';
import {loadWorkbenchTabs,saveWorkbenchTabs} from '../src/storage/workbenchTabs';
afterEach(()=>vi.unstubAllGlobals());
describe('saved IDE tabs',()=>{
 it('validates stored values and survives unavailable storage',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>'{broken'});
  expect(loadWorkbenchTabs()).toEqual({result:'console',mobile:'editor'});
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({version:1,result:'bad',mobile:'scene'})});
  expect(loadWorkbenchTabs()).toEqual({result:'console',mobile:'scene'});
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}});
  expect(()=>saveWorkbenchTabs('variables','inspector')).not.toThrow();
 });
 it('roundtrips selected results/mobile tabs locally',()=>{
  let saved='';vi.stubGlobal('localStorage',{getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value}});
  saveWorkbenchTabs('callstack','console');
  expect(loadWorkbenchTabs()).toEqual({result:'callstack',mobile:'console'});
 });
});
