import {describe,it,expect} from 'vitest';
import {validateWorkbenchLayout} from '../src/storage/workbenchLayout';
describe('layout schema version',()=>{
 it('rejects layouts from unsupported schema versions',()=>{
  expect(validateWorkbenchLayout({version:9,mode:'rows',order:['results','scene','editor'],primaryRatio:70,secondaryRatio:30,hiddenPanes:['editor']})).toMatchObject({mode:'ide',primaryRatio:50,secondaryRatio:70,hiddenPanes:[]});
 });
});
