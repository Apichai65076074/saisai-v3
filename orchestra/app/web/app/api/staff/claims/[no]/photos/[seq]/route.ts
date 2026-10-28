import { staff,problem } from '@/app/api/staff/_lib/service';
import { pool } from '@/lib/db';
import { api } from '@/lib/i18n/api';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:{no:string,seq:string}}){
 const allowed=await api(async()=>{await staff();return {ok:true};});if(!allowed.ok)return allowed;
 const photo=(await pool.query('SELECT p.* FROM claim_photos p JOIN claims c ON c.id=p.claim_id WHERE c.claim_no=$1 AND p.seq::text=$2',[params.no,params.seq])).rows[0];
 if(!photo)return api(async()=>problem(404,'CLAIM_NOT_FOUND'));
 return new Response(new Uint8Array(photo.content),{headers:{'Content-Type':photo.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
