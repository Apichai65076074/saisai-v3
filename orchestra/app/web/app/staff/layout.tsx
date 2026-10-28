import {getLang,getSession,isStaff} from '@/lib/auth';
import {redirect} from 'next/navigation';
import type {ReactNode} from 'react';
import NotifyBox from '@/components/notify/NotifyBox';
export default async function Layout({children}:{children:ReactNode}){const s=await getSession();if(!isStaff(s))redirect('/login');return <><NotifyBox lang={await getLang()} />{children}</>;}
