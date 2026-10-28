import {getLang} from '@/lib/auth';
import {notFound} from 'next/navigation';
import {ShopError} from '@/lib/server/orders';
import {claimDetail} from '@/app/api/staff/_lib/service';
import Claims from '@/app/staff/_components/Claims';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:{no:string}}){
 try{const data=await claimDetail(params.no);return <Claims initial={JSON.parse(JSON.stringify([data]))} lang={await getLang()} detail={true}/>;}
 catch(e){if(e instanceof ShopError && e.status===404)notFound();throw e;}
}
