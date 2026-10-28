import { redirect } from 'next/navigation';
import { getSession, isOwner } from '@/lib/auth';
import { listDocs } from '@/app/api/admin/docs/docs';
import DocsPanel from './DocsPanel';

export const dynamic = 'force-dynamic';

export default async function DocsPage() {
  const session = await getSession();
  if (!isOwner(session)) redirect('/login');
  return <main className="container">
    <h1>{session?.lang === 'en' ? 'Knowledge documents' : 'เอกสารความรู้'}</h1>
    <DocsPanel initialDocs={await listDocs()} lang={session?.lang ?? 'th'} />
  </main>;
}
