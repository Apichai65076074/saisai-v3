import {getLang} from '@/lib/auth';
import {notFound} from 'next/navigation';
import {ShopError} from '@/lib/server/orders';
import {orders} from '@/app/api/staff/_lib/service';
import Orders from '@/app/staff/_components/Orders';
export const dynamic='force-dynamic';
export default async function Page(){
 try{const data=await orders();return <Orders initial={JSON.parse(JSON.stringify(data))} lang={await getLang()} detail={false}/>;}
 catch(e){if(e instanceof ShopError && e.status===404)notFound();throw e;}
}
