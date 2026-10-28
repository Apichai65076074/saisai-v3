'use client';
// แถบเมนูทุกหน้า (T04) · ลิงก์ตามบทบาท · lang-toggle · ชื่อผู้ใช้ + ออกจากระบบ · ป้ายโหมดทดสอบ
// งานอื่นเพิ่มลิงก์ได้ใน LINKS (บอกในรายงาน) · กล่องแจ้งเตือนพนักงาน (T09) วางที่ช่อง slot ขวา
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

type Role = 'customer' | 'staff' | 'owner';
export type NavUser = { displayName: string; displayNameEn: string; role: Role; companyCode: string | null; email: string } | null;

const LINKS: { id: string; href: string; th: string; en: string; roles: (Role | 'guest')[] }[] = [
  { id: 'nav-home', href: '/', th: 'หน้าแรก', en: 'Home', roles: ['guest', 'customer', 'staff', 'owner'] },
  { id: 'nav-products', href: '/products', th: 'สินค้า', en: 'Products', roles: ['guest', 'customer', 'staff', 'owner'] },
  { id: 'nav-order', href: '/order', th: 'สั่งซื้อ', en: 'Order', roles: ['customer'] },
  { id: 'nav-orders', href: '/orders', th: 'ออเดอร์ของฉัน', en: 'My orders', roles: ['customer'] },
  { id: 'nav-quotes', href: '/quotes', th: 'ใบเสนอราคา', en: 'Quotes', roles: ['customer'] },
  { id: 'nav-claims', href: '/claims', th: 'เคลม', en: 'Claims', roles: ['customer'] },
  { id: 'nav-samples', href: '/samples', th: 'ขอตัวอย่าง', en: 'Samples', roles: ['customer'] },
  { id: 'nav-staff-orders', href: '/staff/orders', th: 'ออเดอร์ทั้งหมด', en: 'All orders', roles: ['staff', 'owner'] },
  { id: 'nav-staff-claims', href: '/staff/claims', th: 'เคลมทั้งหมด', en: 'All claims', roles: ['staff', 'owner'] },
  { id: 'nav-owner-holidays', href: '/owner/holidays', th: 'วันหยุดโรงงาน', en: 'Holidays', roles: ['owner'] },
  { id: 'nav-admin-docs', href: '/admin/docs', th: 'เอกสาร', en: 'Documents', roles: ['owner'] },
  { id: 'nav-admin-eval', href: '/admin/eval', th: 'ประเมิน RAG', en: 'RAG eval', roles: ['owner'] },
  { id: 'nav-admin-load', href: '/admin/load', th: 'Load test', en: 'Load test', roles: ['owner'] },
];

export default function Nav({ user, lang, testNow, slot }: { user: NavUser; lang: 'th' | 'en'; testNow: string | null; slot?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const role: Role | 'guest' = user?.role ?? 'guest';
  const t = (th: string, en: string) => (lang === 'en' ? en : th);

  async function toggleLang() {
    setBusy(true);
    await fetch('/api/auth/lang', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: lang === 'th' ? 'en' : 'th' }) });
    setBusy(false);
    router.refresh();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="nav">
      {testNow && (
        <div className="test-banner" data-testid="test-mode-banner" data-value={testNow}>
          {t('โหมดทดสอบ: วันนี้ = ', 'Test mode: today = ')}
          {testNow.slice(0, 16).replace('T', ' ')}
        </div>
      )}
      <div className="nav-inner">
        <Link href="/" className="brand" data-testid="brand-link">
          <img src="/img/mascot/nongsai-idle.webp" alt="" width={32} height={32} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>{t('ใสใส กลาสแวร์', 'SaiSai Glass')}</span>
        </Link>
        <nav className="nav-links">
          {LINKS.filter((l) => l.roles.includes(role)).map((l) => (
            <Link key={l.id} href={l.href} data-testid={l.id} className={pathname === l.href ? 'active' : undefined}>
              {t(l.th, l.en)}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          {slot}
          <button type="button" className="btn-ghost" data-testid="lang-toggle" data-lang={lang} disabled={busy} onClick={toggleLang}
            aria-label={lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}>
            {lang === 'th' ? 'EN' : 'TH'}
          </button>
          {user ? (
            <>
              <span className="current-user" data-testid="current-user" data-role={user.role} data-company={user.companyCode ?? ''}>
                {lang === 'en' ? user.displayNameEn : user.displayName}
              </span>
              <button type="button" className="btn-ghost" data-testid="logout-button" onClick={logout}>
                {t('ออกจากระบบ', 'Log out')}
              </button>
            </>
          ) : (
            <Link href="/login" data-testid="nav-login" className="btn-ghost">
              {t('เข้าสู่ระบบ', 'Log in')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** <html data-ready="true"> หลัง hydrate + load (legacy SPEC: e2e รอ data-ready) */
export function ReadyMarker() {
  useEffect(() => {
    const mark = () => document.documentElement.setAttribute('data-ready', 'true');
    if (document.readyState === 'complete') mark();
    else window.addEventListener('load', mark, { once: true });
  }, []);
  return null;
}
