import {expect,it} from 'vitest';
import {normalizeDesign} from '../../../packages/profile/design.mjs';
it('preserves bounded retro settings through a persistence round trip',()=>{
 const d=normalizeDesign({theme:'retro',palette:'ice',pattern:'grid',headline:'Night room',mood:'Making',sticker:'Stay weird',top8:['Art','Music'],panels:[{title:'Hello',body:'Line one\nLine two'}],modules:['panels','top8','about']});
 expect(normalizeDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
 expect(d.theme).toBe('retro');expect(d.panels[0].body).toContain('\n');
});
it('bounds arbitrary profile input and discards executable styling',()=>{
 const d=normalizeDesign({theme:'script',palette:'red',pattern:'url(evil)',css:'body{}',top8:Array(20).fill('x'.repeat(80)),panels:Array(8).fill({title:'x'.repeat(100),body:'b'.repeat(900)}),modules:['script','top8','top8']});
 expect(d.theme).toBe('gallery');expect(d.palette).toBe('acid');expect(d.top8).toHaveLength(8);expect(d.top8[0]).toHaveLength(40);expect(d.panels).toHaveLength(3);expect(d.panels[0].body).toHaveLength(600);expect(d).not.toHaveProperty('css');expect(d.modules).toEqual(['top8']);
});
