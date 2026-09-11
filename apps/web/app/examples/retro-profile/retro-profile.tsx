'use client';
import Link from 'next/link';
import { useState } from 'react';
import s from './retro.module.css';
const address = '0xB0B0a4C1cDE583C97DA8B42c4E5E623bE4074287';
const obsessions = ['pixel dust', 'weird websites', 'night drives', 'acid graphics', 'old computers', 'tiny worlds', 'happy accidents', 'the unknown'];
export default function RetroProfile() {
 const [palette, setPalette] = useState('acid');
 const [note, setNote] = useState('');
 const [pinned, setPinned] = useState('');
 return <div className={s.room} data-palette={palette}>
  <div className={s.notice}><span>EXAMPLE PROFILE · SAMPLE ART & COPY</span><Link href="/profile/setup">Make your own page ↗</Link></div>
  <header className={s.hero}>
   <div className={s.topline}><span>HOME OF THE BEAUTIFULLY STRANGE</span><span>EST. IN THE INTERNET</span></div>
   <div className={s.heroText}><span className={s.kicker}>you found my corner of the web.</span><h1>B0B0<span>AFTER HOURS</span></h1><p>A little art. A little chaos.<br />A place that feels like me.</p></div>
   <div className={s.orbit} aria-hidden="true"><span>✳</span></div><div className={s.sticker}>KEEP THE<br />INTERNET<br /><b>WEIRD</b> ↗</div>
   <div className={s.ticker}>★ OPEN TABS, OPEN MIND ★ UNDER CONSTANT REINVENTION ★ HANDMADE ON THE INTERNET ★</div>
  </header>
  <div className={s.layout}>
   <aside className={s.sidebar}>
    <section className={s.window}><h2 className={s.bar}>about_me.txt <span>✳</span></h2><div className={s.inside}>
     <div className={s.avatar} aria-label="Abstract sample avatar">b<span>0</span>b<span>0</span><small>100% INTERNET ENERGY</small></div>
     <h3>B0B0 <span className={s.spark}>✧</span></h3><p className={s.status}>Mood: creatively unsupervised</p><p>Collecting little pieces of the future. Making things that probably didn’t need to exist. Glad you’re here.</p><p className={s.caption}>Example persona · not a verified identity</p>
     <a href="#guestbook" className={s.action}>Leave a little note ↓</a>
    </div></section>
    <section className={s.window}><h2 className={s.bar}>room_settings <span>◧</span></h2><div className={s.inside}><p>Same room. Different frequency.</p><div className={s.switches}>{['acid','bubblegum','ice'].map(p=><button key={p} type="button" aria-pressed={palette===p} onClick={()=>setPalette(p)}>{p}</button>)}</div><p className={s.caption}>Try a color. This preview resets when you leave.</p></div></section>
    <section className={s.wallet}><h2>The address behind the example</h2><code>{address}</code><Link href={`/profile/${address.toLowerCase()}`}>View this wallet’s public page ↗</Link><p>Wallet reference only. Ownership and profile authorship have not been verified.</p></section>
   </aside>
   <div className={s.content}>
    <section className={s.manifesto}><span className={s.kicker}>☆ A PERSONAL SPACE, AGAIN</span><h2>Less algorithm.<br /><em>More personality.</em></h2><p>Welcome to an internet room with the furniture moved around. Stay a while. Look at the strange things. Make yourself at home.</p><span className={s.doodle} aria-hidden="true">↝</span></section>
    <section className={s.window}><h2 className={s.bar}>on_my_wall / selected experiments <span>▦</span></h2><div className={s.artGrid}>
     <figure><div className={`${s.art} ${s.portal}`} role="img" aria-label="Concentric neon portal on a dark grid"><i /><span>ENTER<br />SOMETHING<br />ELSE.</span></div><figcaption><b>01 / Signal from nowhere</b><span>Portal study · digital composition</span></figcaption></figure>
     <figure><div className={`${s.art} ${s.flower}`} role="img" aria-label="Pink experimental flower on acid green"><span>✳</span><small>GROW<br />SIDEWAYS</small></div><figcaption><b>02 / Happy accident</b><span>Shape study · digital composition</span></figcaption></figure>
    </div><p className={s.artNote}>Original sample design studies for this preview. These are not verified NFTs or wallet holdings.</p></section>
    <section className={s.window}><h2 className={s.bar}>my_top_8 <span>♡</span></h2><div className={s.inside}><p className={s.caption}>Current obsessions. No ranking drama.</p><ol className={s.topEight}>{obsessions.map((o,i)=><li key={o}><span aria-hidden="true">{['✦','⌘','☾','✳','▧','◈','☺','?'][i]}</span><b>{o}</b></li>)}</ol></div></section>
    <section id="guestbook" className={s.window}><h2 className={s.bar}>guestbook / leave your trace <span>✎</span></h2><div className={s.inside}><p>A tiny note for this tiny corner of the internet.</p><form onSubmit={e=>{e.preventDefault();if(note.trim()){setPinned(note.trim());setNote('');}}}><label htmlFor="room-note">Your note</label><textarea id="room-note" maxLength={240} required value={note} onChange={e=>setNote(e.target.value)} placeholder="Your page feels like a mixtape…" /><div className={s.formFoot}><span>{note.length}/240 · preview only</span><button type="submit" disabled={!note.trim()}>Pin to this preview ↗</button></div></form><div aria-live="polite">{pinned&&<blockquote className={s.pinned}>{pinned}<cite>Your preview note · not published</cite></blockquote>}</div><p className={s.caption}>Nothing is sent or saved. Reloading clears your note.</p></div></section>
   </div>
  </div>
  <footer className={s.roomFooter}><span>BUILT DIFFERENT. STILL UNDER CONSTRUCTION. ✳</span><Link href="/profile/setup">Your space is next ↗</Link></footer>
 </div>;
}
