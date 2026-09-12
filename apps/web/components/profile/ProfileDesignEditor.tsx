'use client';
import {useState} from 'react';
import {type ProfileDesign} from '../../../../packages/profile/design.mjs';
import {applyProfileTemplate,profileTemplates} from '../../lib/profileTemplates';
import {starterCss,starterHtml} from '../../lib/profileCustomCode';
import s from './ProfileDesignEditor.module.css';
export default function ProfileDesignEditor({design,onChange}:{design:ProfileDesign;onChange:(design:ProfileDesign)=>void}){
 const [previous,setPrevious]=useState<ProfileDesign|null>(null);
 return <section><h3>Starting templates</h3><p>Pick a layout and palette. Your words, images, featured artwork, and custom code are kept.</p><div className={s.templates}>{profileTemplates.map(t=><button className={s.template} type="button" key={t.id} aria-label={t.id==='retro'?'Start with a retro room':undefined} onClick={()=>{setPrevious(design);onChange(applyProfileTemplate(design,t.id));}}><span className={`${s.swatch} ${s[t.id]}`} aria-hidden="true"><i/><i/><i/></span><strong>{t.name}</strong><span>{t.description}</span></button>)}</div>{previous&&<button type="button" className="secondary" onClick={()=>{onChange(previous);setPrevious(null);}}>Undo template change</button>}
 <details className={s.advanced}><summary>Advanced: edit HTML & CSS</summary><p>Build a custom section inside your profile. CSS applies only inside this section. Scripts, forms, embeds, external requests, and wallet interactions are disabled. Use the Links and image fields for links and media.</p>
 <label className="studioCheckbox"><input type="checkbox" checked={design.modules.includes('custom')} onChange={e=>onChange({...design,modules:e.target.checked?[...design.modules,'custom']:design.modules.filter(m=>m!=='custom')})}/>Show custom HTML section</label>
 <label>Custom HTML<textarea className={s.code} spellCheck={false} rows={12} maxLength={20000} value={design.customHtml} onChange={e=>onChange({...design,customHtml:e.target.value})}/></label><p className="hint">{design.customHtml.length}/20,000 characters · semantic HTML and class/id attributes supported</p>
 <label>Custom CSS<textarea className={s.code} spellCheck={false} rows={12} maxLength={20000} value={design.customCss} onChange={e=>onChange({...design,customCss:e.target.value})}/></label><p className="hint">{design.customCss.length}/20,000 characters</p>
 <label>Custom section height<select value={design.customHeight} onChange={e=>onChange({...design,customHeight:Number(e.target.value)})}><option value={320}>Compact · 320 px</option><option value={560}>Standard · 560 px</option><option value={800}>Tall · 800 px</option><option value={1200}>Full canvas · 1200 px</option></select></label>
 <button type="button" className="secondary" disabled={Boolean(design.customHtml||design.customCss)} onClick={()=>onChange({...design,customHtml:starterHtml,customCss:starterCss,modules:design.modules.includes('custom')?design.modules:[...design.modules,'custom']})}>Insert starter HTML & CSS</button><p className="hint">The starter is available when both code fields are empty. Preview below, then save a draft or publish through your wallet.</p></details></section>;
}
