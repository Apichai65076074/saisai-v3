import { getLang } from '@/lib/auth';

export default async function NotFound() {
  const lang = await getLang();
  return (
    <div className="card">
      <h1 data-testid="not-found-message">{lang === 'en' ? 'Page not found' : 'ไม่พบหน้านี้'}</h1>
    </div>
  );
}
