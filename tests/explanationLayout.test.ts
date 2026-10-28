import {describe,it,expect} from 'vitest';
import {explanationLayout,DEFAULT_WORKBENCH_LAYOUT,validateWorkbenchLayout} from '../src/storage/workbenchLayout';
describe('explanation-focused layouts',()=>{
 it('shows only the explanation board without console/editor',()=>{
  const result=explanationLayout(DEFAULT_WORKBENCH_LAYOUT,'only');
  expect(result.hiddenPanes).toEqual(['editor','results']);
  expect(result.maximizedPane).toBeNull();
  expect(validateWorkbenchLayout(JSON.parse(JSON.stringify(result)))).toEqual(result);
 });
 it('gives explanation most width with code beside it and no console',()=>{
  const result=explanationLayout({...DEFAULT_WORKBENCH_LAYOUT,maximizedPane:'results',order:['results','scene','editor']},'with-code');
  expect(result.order).toEqual(['editor','scene','results']);
  expect(result.primaryRatio).toBe(30);
  expect(result.hiddenPanes).toEqual(['results']);
  expect(result.maximizedPane).toBeNull();
 });
});
