'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export default function ProfilePreviewWindow({children}:{children:ReactNode}){
 const [target,setTarget]=useState<HTMLElement|null>(null);const [popup,setPopup]=useState<Window|null>(null);const [error,setError]=useState('');
 useEffect(()=>{if(!popup)return;const close=()=>{setTarget(null);setPopup(null);};popup.addEventListener('beforeunload',close);return()=>{popup.removeEventListener('beforeunload',close);popup.close();};},[popup]);
 function open(){if(popup&&!popup.closed){popup.focus();return;}const win=window.open('', 'nftfactory-draft-preview','popup,width=1200,height=900');if(!win){setError('Your browser blocked the preview window. Allow pop-ups for NFTFactory and try again.');return;}win.document.title='Your profile — live draft preview';win.document.body.replaceChildren();for(const node of document.querySelectorAll('link[rel="stylesheet"],style'))win.document.head.appendChild(node.cloneNode(true));const base=win.document.createElement('base');base.href=window.location.origin;win.document.head.appendChild(base);const root=win.document.createElement('main');root.style.cssText='padding:20px;max-width:1600px;margin:auto';win.document.body.appendChild(root);setPopup(win);setTarget(root);setError('');}
 return <><button type="button" className="secondary" onClick={open}>Open live preview ↗</button>{error&&<p role="alert">{error}</p>}{target&&createPortal(<><p className="serviceNotice">Live draft preview · Changes are not published. Keep the editor open.</p>{children}</>,target)}</>;
}
