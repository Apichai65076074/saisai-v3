import {getLang} from '@/lib/auth';
import {notFound} from 'next/navigation';
import {ShopError} from '@/lib/server/orders';
import {claims} from '@/app/api/staff/_lib/service';
import Claims from '@/app/staff/_components/Claims';
export const dynamic='force-dynamic';
export default async function Page(){
 try{const data=await claims();return <Claims initial={JSON.parse(JSON.stringify(data))} lang={await getLang()} detail={false}/>;}
 catch(e){if(e instanceof ShopError && e.status===404)notFound();throw e;}
}
