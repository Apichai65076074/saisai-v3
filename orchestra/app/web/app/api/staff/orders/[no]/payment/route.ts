import { api } from '@/lib/i18n/api';
import { readJson } from '@/lib/http';
import { pool } from '@/lib/db';
import { staff,orders,orderDetail,updateOrder,claims,claimDetail,updateClaim,holidays,changeHoliday } from '@/app/api/staff/_lib/service';
export const dynamic='force-dynamic';
export async function POST(_:Request,{params}:{params:{no:string}}){return api(async()=>{const s=await staff();return {ok:true,order:await updateOrder(params.no,s.userId,true,{})};},201);}
