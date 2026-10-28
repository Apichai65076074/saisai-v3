import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import ChatWidget from '@/components/chat/ChatWidget';
import Mascot3D from '@/components/three/Mascot3D';
import VoiceControls from '@/components/voice/VoiceControls';
import Nav, { ReadyMarker, type NavUser } from '@/components/Nav';
import { getLang, getSession, getUserInfo } from '@/lib/auth';
import { clock } from '@/lib/clock';
import { testResetAllowed } from '@/lib/test-mode';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ใสใส กลาสแวร์ · SaiSai Glass',
  description: 'ขวดแก้ว B2B · สั่งซื้อ ใบเสนอราคา และแชทกับน้องใส',
};

async function loadNav(): Promise<{ user: NavUser; lang: 'th' | 'en'; testNow: string | null }> {
  const lang = await getLang();
  let user: NavUser = null;
  let testNow: string | null = null;
  try {
    const s = await getSession();
    const info = s ? await getUserInfo(s.userId) : null;
    if (info) user = { displayName: info.displayName, displayNameEn: info.displayNameEn, role: info.role, companyCode: info.companyCode, email: info.email };
    if (testResetAllowed()) {
      const c = await clock();
      testNow = c.fixed ? c.iso : null;
    }
  } catch {
    // DB ยังไม่พร้อม → แสดงหน้าแบบไม่ล็อกอิน
  }
  return { user, lang, testNow };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { user, lang, testNow } = await loadNav();
  return (
    <html lang={lang} data-ready="false">
      <body>
        <Nav user={user} lang={lang} testNow={testNow} />
        <main className="container">{children}</main>
        <ChatWidget lang={lang} identity={user?.email} mascotSlot={<Mascot3D allowTest={testResetAllowed()} />} voiceSlot={<VoiceControls lang={lang} />} />
        <ReadyMarker />
      </body>
    </html>
  );
}
