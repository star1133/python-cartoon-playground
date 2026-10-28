import React from 'react';
import {renderToString} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {NumberBoard2D} from '../src/scene/NumberBoard2D';
import {reduceSceneStateHistory,INITIAL_SCENE_STATE} from '../src/scene/sceneReducer';
import type {TraceEvent} from '../src/runtime/types';
describe('unchanged observed values',()=>{
 it('shows exact existing values with subtle glow and no transfer arrows',()=>{
  const locals={count:{type:'int',value:'7'},delta:{type:'float',value:'-0.25'},name:{type:'str',value:"'ไทย'"}};
  const events:TraceEvent[]=[{seq:1,kind:'line',line:2,locals},{seq:2,kind:'line',line:3,locals}];
  const html=renderToString(React.createElement(NumberBoard2D,{sceneState:reduceSceneStateHistory(events,1),currentEvent:events[1]}));
  expect(html).toContain('ยังเป็นค่าเดิม');expect(html).toContain('nb2d-stable-number');
  expect(html).toContain('7');expect(html).toContain('-0.25');expect(html).toContain('count');
  expect(html).not.toContain('ไม่มีการเปลี่ยนแปลงค่าตัวแปรในขั้นตอนนี้');expect(html).not.toContain('data-testid="flow-arrow-1"');
 });
 it('does not invent numbers when no variables are recorded',()=>{
  const html=renderToString(React.createElement(NumberBoard2D,{sceneState:INITIAL_SCENE_STATE}));
  expect(html).toContain('ยังไม่มีค่าตัวแปรที่บันทึก');expect(html).not.toContain('data-testid="stable-value"');
 });
});
