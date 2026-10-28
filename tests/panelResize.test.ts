import {describe,it,expect} from 'vitest';
import {clampPanelSplit} from '../src/components/PanelResizeHandle';
describe('panel size bounds',()=>{it('keeps both panels accessible and rejects invalid values',()=>{expect(clampPanelSplit(-1)).toBe(20);expect(clampPanelSplit(100)).toBe(80);expect(clampPanelSplit(55)).toBe(55);expect(clampPanelSplit(NaN)).toBe(60);});});
