export const PROFILE_MODULES = ['featured', 'artwork', 'about', 'links', 'collections', 'top8', 'panels'];
export function normalizeDesign(value) {
  const input=value && typeof value==='object' ? value : {};
  const featured = Array.isArray(input.featured) ? [...new Set(input.featured.filter(item => typeof item === 'string' && /^\d+:0x[0-9a-f]{40}:\d{1,78}$/.test(item)))].slice(0,6) : [];
  const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
  return {version:1,palette:['acid','bubblegum','ice'].includes(input.palette)?input.palette:'acid',pattern:['stars','grid','plain'].includes(input.pattern)?input.pattern:'stars',headline:text(input.headline,100),mood:text(input.mood,100),sticker:text(input.sticker,40),top8:Array.isArray(input.top8)?input.top8.filter(v=>typeof v==='string').slice(0,8).map(v=>text(v,40)):[],panels:Array.isArray(input.panels)?input.panels.filter(v=>v&&typeof v==='object').slice(0,3).map(v=>({title:text(v.title,60),body:text(v.body,600)})):[],featured,theme:['gallery','midnight','paper','retro'].includes(input.theme)?input.theme:'gallery',font:input.font==='serif'?'serif':'sans',modules:Array.isArray(input.modules)?[...new Set(input.modules.filter(item=>PROFILE_MODULES.includes(item)))]:[...PROFILE_MODULES.slice(0,5)]};
}
export function safeProfileLink(value) {
  try {const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
