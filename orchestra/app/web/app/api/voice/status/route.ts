// GET /api/voice/status (T15) → {enabled} = มี stt-worker consume `stt.request` (worker cancel consumer เมื่อ STT ล่ม)
import { consumerCount } from '@/lib/mq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const n = await consumerCount('stt.request');
  return Response.json({ enabled: n > 0 }, { headers: { 'cache-control': 'no-store' } });
}
