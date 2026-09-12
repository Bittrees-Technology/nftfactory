import {normalizeDesign,type ProfileDesign} from '../../../packages/profile/design.mjs';
export const profileTemplates = [
 {id:'gallery',name:'White cube',description:'Clean gallery, artwork first.',theme:'gallery',font:'sans',palette:'acid',pattern:'plain',modules:['featured','artwork','about','links','collections']},
 {id:'paper',name:'Artist journal',description:'Warm paper and editorial typography.',theme:'paper',font:'serif',palette:'acid',pattern:'plain',modules:['about','panels','featured','artwork','links']},
 {id:'midnight',name:'Night gallery',description:'Quiet midnight backdrop for bold work.',theme:'midnight',font:'sans',palette:'ice',pattern:'plain',modules:['featured','about','artwork','collections','links']},
 {id:'retro',name:'Retro room',description:'Acid green, pixel stars and personal panels.',theme:'retro',font:'sans',palette:'acid',pattern:'stars',modules:['about','top8','panels','featured','artwork','links','collections']},
 {id:'bubblegum',name:'Candy scrapbook',description:'Pink and lilac with a playful grid.',theme:'retro',font:'sans',palette:'bubblegum',pattern:'grid',modules:['panels','top8','about','featured','links']},
 {id:'ice',name:'Digital laboratory',description:'Ice blue, clean grid and experiments first.',theme:'retro',font:'sans',palette:'ice',pattern:'grid',modules:['panels','featured','about','top8','artwork','links']}
] as const;
export function applyProfileTemplate(current:ProfileDesign,id:string){
 const template=profileTemplates.find(t=>t.id===id);if(!template)return current;
 // Preserve authored content and a user's enabled custom section.
 return normalizeDesign({...current,...template,modules:[...template.modules.filter(module=>current.modules.includes(module)),...current.modules.filter(module=>!(template.modules as readonly string[]).includes(module))]});
}
