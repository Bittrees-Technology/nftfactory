'use client';
import {useEffect,useRef} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {productLinks,productSection} from '../lib/productNavigation';
import HeaderWalletButton from './HeaderWalletButton';
export default function SiteNavigation() {
  const pathname = usePathname() || '/';
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(menu.current)menu.current.open=false;},[pathname]);
  const activeSection=productSection(pathname);
  return <header className="siteHeader"><Link className="brandLink" href="/" aria-label="NFTFactory home">NFTFactory<span className="brandDot" /></Link><nav className="desktopNavigation" aria-label="Main">{productLinks.map(({href:url,label})=><Link key={url} href={url} aria-current={activeSection===url ? 'page' : undefined}>{label}</Link>)}</nav><div className="headerActions"><HeaderWalletButton /><details ref={menu} className="mobileNavigation" onKeyDown={event=>{if(event.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}><summary>Menu</summary><nav aria-label="Mobile" onClick={()=>{if(menu.current)menu.current.open=false;}}>{productLinks.map(({href:url,label})=><Link key={url} href={url} aria-current={activeSection===url ? 'page' : undefined}>{label}</Link>)}<Link href="/wiki">Help</Link></nav></details></div></header>;
}
