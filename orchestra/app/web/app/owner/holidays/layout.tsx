import {getLang,getSession,isOwner} from '@/lib/auth';
import {redirect} from 'next/navigation';
import type {ReactNode} from 'react';
import NotifyBox from '@/components/notify/NotifyBox';
export default async function Layout({children}:{children:ReactNode}){const s=await getSession();if(!isOwner(s))redirect('/login');return <><NotifyBox lang={await getLang()} />{children}</>;}
