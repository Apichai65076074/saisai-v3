import Link from 'next/link';
import Hero from '@/components/three/Hero';
import { getLang } from '@/lib/auth';
export default async function Home() {
  const th = (await getLang()) === 'th';
  return <><header style={{ padding: '32px 0' }}><p style={{ color: '#0E7C9B' }}>SAISAI GLASSWARE</p><h1>{th ? 'ขวดแก้วใส เพื่อทุกไอเดียของคุณ' : 'Glass bottles for every idea'}</h1><p>{th ? 'ค้นพบขวดแก้ว 9 แบบ จากโรงงานสู่ธุรกิจคุณ' : 'Explore nine glass bottles, from our factory to your business'}</p><div style={{ display: 'flex', gap: 16 }}><Link className="btn" href="/order">{th ? 'สั่งซื้อ' : 'Order'}</Link><Link className="btn" href="/products">{th ? 'ดูสินค้า' : 'Products'}</Link></div></header><Hero /><p style={{ padding: '30px 0 180px' }}>{th ? 'เลื่อนชมสายพานโรงงาน · คลิกขวดเพื่อเลือกสินค้า' : 'Scroll through the factory conveyor · Select a bottle to order'}</p></>;
}
