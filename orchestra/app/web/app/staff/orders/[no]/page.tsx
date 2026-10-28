import {getLang} from '@/lib/auth';
import {notFound} from 'next/navigation';
import {ShopError} from '@/lib/server/orders';
import {orderDetail} from '@/app/api/staff/_lib/service';
import Orders from '@/app/staff/_components/Orders';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:{no:string}}){
 try{const data=await orderDetail(params.no);return <Orders initial={JSON.parse(JSON.stringify([data]))} lang={await getLang()} detail={true}/>;}
 catch(e){if(e instanceof ShopError && e.status===404)notFound();throw e;}
}
