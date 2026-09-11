export const PROFILE_MODULES = ['featured', 'artwork', 'about', 'links', 'collections'];
export function normalizeDesign(value) {
  const input=value && typeof value==='object' ? value : {};
  const featured = Array.isArray(input.featured) ? [...new Set(input.featured.filter(item => typeof item === 'string' && /^\d+:0x[0-9a-f]{40}:\d{1,78}$/.test(item)))].slice(0,6) : [];
  return {version:1,featured,theme:['gallery','midnight','paper'].includes(input.theme)?input.theme:'gallery',font:input.font==='serif'?'serif':'sans',modules:Array.isArray(input.modules)?[...new Set(input.modules.filter(item=>PROFILE_MODULES.includes(item)))]:[...PROFILE_MODULES]};
}
export function safeProfileLink(value) {
  try {const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
