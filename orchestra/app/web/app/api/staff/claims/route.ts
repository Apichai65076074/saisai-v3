import { api } from '@/lib/i18n/api';
import { readJson } from '@/lib/http';
import { pool } from '@/lib/db';
import { staff,orders,orderDetail,updateOrder,claims,claimDetail,updateClaim,holidays,changeHoliday } from '@/app/api/staff/_lib/service';
export const dynamic='force-dynamic';
export async function GET(req:Request){return api(async()=>{await staff();return {ok:true,claims:await claims(undefined,new URL(req.url).searchParams.get('status'))};});}
