import { api } from '@/lib/i18n/api';
import { readJson } from '@/lib/http';
import { pool } from '@/lib/db';
import { staff,orders,orderDetail,updateOrder,claims,claimDetail,updateClaim,holidays,changeHoliday } from '@/app/api/staff/_lib/service';
export const dynamic='force-dynamic';
export async function GET(){return api(async()=>{await staff(true);return {ok:true,holidays:await holidays()};});}
export async function POST(req:Request){return api(async()=>{await staff(true);return changeHoliday(await readJson(req));},201);}
