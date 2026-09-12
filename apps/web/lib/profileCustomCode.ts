import sanitizeHtml from 'sanitize-html';
export function customProfileDocument(html:string,css:string){
 const clean=sanitizeHtml(html.slice(0,20000),{
  allowedTags:['section','article','header','footer','main','aside','div','span','p','h1','h2','h3','h4','h5','h6','strong','em','b','i','u','s','small','br','hr','ul','ol','li','blockquote','pre','code','figure','figcaption','details','summary','table','thead','tbody','tr','th','td'],
  allowedAttributes:{'*':['class','id','title','lang','dir'],'th':['colspan','rowspan'],'td':['colspan','rowspan']},
  disallowedTagsMode:'discard',nonTextTags:['script','style','textarea','option','iframe','object','template'],
 });
 // Escape raw-text closing delimiters so CSS cannot introduce markup.
 const safeCss=css.slice(0,20000).replace(/</g,'\\3c ');
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:24px;font:16px/1.6 system-ui;color:#eee;background:#15182c;overflow-wrap:anywhere}*{box-sizing:border-box}pre{white-space:pre-wrap}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}${safeCss}</style></head><body>${clean}</body></html>`;
}
export const starterHtml='<section class="room"><p class="eyebrow">A SMALL CORNER OF THE WEB</p><h1>Make something strange.</h1><p>Replace this with your own words, layout, and colors.</p><div class="sticker">STAY CURIOUS ✳</div></section>';
export const starterCss='.room { padding: 24px; border: 1px solid #7883a5; }\nh1 { color: #d6ff58; font-size: clamp(32px, 7vw, 72px); line-height: 1; }\n.eyebrow { font: 12px monospace; letter-spacing: 2px; }\n.sticker { display: inline-block; background: #ff86c8; color: #15182c; padding: 18px; transform: rotate(-4deg); font-weight: bold; }';
