'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
type Item={id:number;type:string;no:string;message:string};
export default function NotifyBox({lang='th'}:{lang?:'th'|'en'}){
 const [items,setItems]=useState<Item[]>([]);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;let timer:ReturnType<typeof setTimeout>;
  async function poll(){try{const r=await fetch('/api/staff/notifications',{cache:'no-store'});if(!r.ok)throw Error();const j=await r.json();if(active){setItems(j.notifications);setFailed(false);}}catch{if(active)setFailed(true);}finally{if(active)timer=setTimeout(poll,2000);}}
  void poll();return()=>{active=false;clearTimeout(timer);};
 },[]);
 const labels:Record<string,string>=lang==='th'?{'order.created':'ออเดอร์ใหม่','claim.created':'เคลมใหม่','quote.created':'ใบเสนอราคาใหม่'}:{'order.created':'New order','claim.created':'New claim','quote.created':'New quote'};
 return <aside data-testid="notify-box" className="card" aria-label={lang==='th'?'การแจ้งเตือน':'Notifications'}><h2>{lang==='th'?'การแจ้งเตือน':'Notifications'}</h2>
 {failed&&<p role="status">{lang==='th'?'กำลังเชื่อมต่อการแจ้งเตือนอีกครั้ง':'Reconnecting notifications'}</p>}
 {!items.length&&<p>{lang==='th'?'ยังไม่มีการแจ้งเตือน':'No notifications yet'}</p>}
 <ul aria-live="polite">{items.map(i=><li key={i.id} data-testid="notify-item" data-type={i.type}><Link href={i.type==='order.created'?`/staff/orders/${i.no}`:i.type==='claim.created'?`/staff/claims/${i.no}`:'/staff/orders'}>{labels[i.type]??i.message} · {i.no}</Link></li>)}</ul></aside>;
}
