// GET /api/tts/status (T15) → {enabled} = มี tts-worker consume `tts.request`
import { consumerCount } from '@/lib/mq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const n = await consumerCount('tts.request');
  return Response.json({ enabled: n > 0 }, { headers: { 'cache-control': 'no-store' } });
}
