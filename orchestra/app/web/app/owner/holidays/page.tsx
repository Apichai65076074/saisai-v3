import {getLang} from '@/lib/auth';
import {pool} from '@/lib/db';
import {holidays} from '@/app/api/staff/_lib/service';
import Holidays from './Holidays';
export const dynamic='force-dynamic';
export default async function Page(){const tomorrow=(await pool.query("SELECT (app_today()+1)::text AS date")).rows[0].date;return <Holidays initial={await holidays()} tomorrow={tomorrow} lang={await getLang()}/>;}
