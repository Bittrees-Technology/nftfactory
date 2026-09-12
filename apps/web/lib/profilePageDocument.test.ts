import {it,expect} from 'vitest';
import {profilePageDocument} from './profilePageDocument';
import {applyProfileTemplate} from './profileTemplates';
import {normalizeDesign} from '../../../packages/profile/design.mjs';
import {profileLinkLabel} from './profileLinkLabel';
it('custom pages hide disabled artwork while displaying enabled about and Top 8',()=>{
 const html=profilePageDocument('0x123',{aboutMe:'Artist story',design:{modules:['about','top8'],top8Targets:[{label:'BOB',url:'/profile/eth.bobofbuilding'}]}},[]);
 expect(html).toContain('Artist story');expect(html).toContain('BOB');expect(html).not.toContain('Collected artwork');
});
it('switching templates preserves hidden artwork and enabled Top 8',()=>{
 const design=applyProfileTemplate(normalizeDesign({modules:['about','top8']}),'gallery');
 expect(design.modules).toContain('top8');expect(design.modules).not.toContain('artwork');
});
it('social links identify the platform and account',()=>{expect(profileLinkLabel('https://x.com/RagingBitcoin')).toMatchObject({label:'X',account:'RagingBitcoin'});expect(profileLinkLabel('https://raging.eth.limo/').account).toBe('raging.eth.limo');});
