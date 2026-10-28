import { getSession, isStaff } from '@/lib/auth';
import { pool, tx } from '@/lib/db';
import { ShopError } from '@/lib/server/orders';
import { checkAdvance, creditDueDate, bangkokDate, canTransitionClaim, checkRejectReason, checkHolidayInput, checkHolidayDate, STATUS_SHIPPED, type ClaimStatus, type RuleError } from '@/lib/rules';
export function problem(status: number, code: string, params?: Record<string,string|number>): never { throw new ShopError(status, [{code,params}]); }
export async function staff(owner = false) {
  const s = await getSession();
  if (owner && !s) problem(401,'UNAUTHORIZED');
  if (!isStaff(s) || (owner && s?.role !== 'owner')) problem(403,'FORBIDDEN');
  return s!;
}
export async function orders(no?: string, status?: string | null) {
  return (await pool.query(`SELECT o.*, c.name AS company,c.name_en AS company_en,p.model_code,p.color,
    EXISTS(SELECT 1 FROM payments WHERE order_id=o.id) AS paid
    FROM orders o JOIN companies c ON c.id=o.company_id JOIN products p ON p.id=o.product_id
    WHERE ($1::text IS NULL OR o.order_no=$1) AND ($2::text IS NULL OR o.status::text=$2) ORDER BY o.id DESC`,[no??null,status||null])).rows;
}
export async function orderDetail(no:string) {
  const o = (await orders(no))[0]; if(!o) problem(404,'ORDER_NOT_FOUND');
  const history = (await pool.query(`SELECT h.from_status AS "from",h.to_status AS "to",h.changed_at AS at,h.reason,u.display_name AS by FROM order_status_history h JOIN users u ON u.id=h.changed_by WHERE order_id=$1 ORDER BY h.id`,[o.id])).rows;
  return {...o,history};
}
export async function updateOrder(no:string, userId:number, payment:boolean, body:Record<string,unknown>) {
  await tx(async c=>{
    const o=(await c.query('SELECT * FROM orders WHERE order_no=$1 FOR UPDATE',[no])).rows[0]; if(!o) problem(404,'ORDER_NOT_FOUND');
    const paid=(await c.query('SELECT 1 FROM payments WHERE order_id=$1',[o.id])).rowCount!>0;
    if(payment){
      if(paid) problem(409,'PAYMENT_EXISTS');
      await c.query('INSERT INTO payments(order_id,amount,recorded_by,recorded_at) VALUES($1,$2,$3,app_now())',[o.id,o.total_amount,userId]);
    } else {
      const step=checkAdvance(o.status,body.to as number|undefined,o.payment_terms,paid);
      if(step.error) throw new ShopError(409,[step.error]);
      const date=(await c.query('SELECT app_now() AS at')).rows[0].at;
      const due=step.to===STATUS_SHIPPED && o.payment_terms==='credit30' ? creditDueDate(bangkokDate(date)):null;
      await c.query('UPDATE orders SET status=$2,shipped_at=$3,due_date=$4 WHERE id=$1',[o.id,step.to,step.to===STATUS_SHIPPED?date:null,due]);
      await c.query('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by,changed_at) VALUES($1,$2,$3,$4,$5)',[o.id,o.status,step.to,userId,date]);
    }
  });
  return orderDetail(no);
}
export async function claims(no?:string,status?:string|null){
  return (await pool.query(`SELECT cl.*,o.order_no,c.name AS company,c.name_en AS company_en,u.display_name AS reporter FROM claims cl JOIN orders o ON o.id=cl.order_id JOIN companies c ON c.id=cl.company_id JOIN users u ON u.id=cl.reported_by WHERE ($1::text IS NULL OR cl.claim_no=$1) AND ($2::text IS NULL OR cl.status=$2) ORDER BY cl.id DESC`,[no??null,status||null])).rows;
}
export async function claimDetail(no:string){
  const cl=(await claims(no))[0];if(!cl) problem(404,'CLAIM_NOT_FOUND');
  const history=(await pool.query(`SELECT h.from_status AS "from",h.to_status AS "to",h.changed_at AS at,h.reason,u.display_name AS by FROM claim_status_history h JOIN users u ON u.id=h.changed_by WHERE claim_id=$1 ORDER BY h.id`,[cl.id])).rows;
  const photos=(await pool.query('SELECT seq,file_name FROM claim_photos WHERE claim_id=$1 ORDER BY seq',[cl.id])).rows;
  return {...cl,history,photos};
}
export async function updateClaim(no:string,userId:number,body:Record<string,unknown>){
  await tx(async c=>{
    const cl=(await c.query('SELECT * FROM claims WHERE claim_no=$1 FOR UPDATE',[no])).rows[0];if(!cl) problem(404,'CLAIM_NOT_FOUND');
    if(!canTransitionClaim(cl.status as ClaimStatus,body.to)) problem(409,'CLAIM_TRANSITION');
    const reason=typeof body.reason==='string'?body.reason.trim():'';
    if(body.to==='rejected'){const err=checkRejectReason(reason);if(err)throw new ShopError(400,[err]);}
    await c.query('UPDATE claims SET status=$2,reject_reason=$3 WHERE id=$1',[cl.id,body.to,body.to==='rejected'?reason:null]);
    await c.query('INSERT INTO claim_status_history(claim_id,from_status,to_status,changed_by,changed_at,reason) VALUES($1,$2,$3,$4,app_now(),$5)',[cl.id,cl.status,body.to,userId,reason||null]);
  });return claimDetail(no);
}
export async function holidays(){return (await pool.query(`SELECT holiday_date AS date,name_th,name_en FROM factory_holiday ORDER BY holiday_date`)).rows;}
export async function changeHoliday(body:Record<string,unknown>,remove=false){
  return tx(async c=>{
    const today=(await c.query('SELECT app_today()::text AS today')).rows[0].today;
    let error:RuleError|null=null;
    let v={date:String(body.date??''),nameTh:'',nameEn:''};
    if(remove)error=checkHolidayDate(body.date,today);
    else {const checked=checkHolidayInput(body,today);if('error' in checked)error=checked.error;else v=checked.value;}
    if(error)throw new ShopError(error.code==='HOLIDAY_PAST'?422:400,[error]);
    await c.query("SELECT pg_advisory_xact_lock(4244, ($1::date - DATE '2000-01-01'))",[v.date]);
    if(remove){const r=await c.query('DELETE FROM factory_holiday WHERE holiday_date=$1',[v.date]);if(!r.rowCount)problem(404,'HOLIDAY_NOT_FOUND',{date:v.date});return {ok:true,date:v.date};}
    if((await c.query('SELECT 1 FROM factory_holiday WHERE holiday_date=$1',[v.date])).rowCount)problem(409,'HOLIDAY_EXISTS',{date:v.date});
    const pending=(await c.query('SELECT order_no FROM orders WHERE pickup_date=$1 AND status<6 ORDER BY order_no',[v.date])).rows;
    if(pending.length)problem(409,'HAS_ORDERS',{date:v.date,orders:pending.map(o=>o.order_no).join(', ')});
    await c.query('INSERT INTO factory_holiday(holiday_date,name_th,name_en) VALUES($1,$2,$3)',[v.date,v.nameTh,v.nameEn]);
    return {ok:true,holiday:{date:v.date,name_th:v.nameTh,name_en:v.nameEn}};
  });
}
