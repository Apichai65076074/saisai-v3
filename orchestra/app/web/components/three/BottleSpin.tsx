'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
const Scene = dynamic(() => import('./BottleSpinScene'), { ssr: false });
export default function BottleSpin({ model, color, lang }: { model: string; color: string; lang: 'th' | 'en' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting)); if (ref.current) io.observe(ref.current); return () => io.disconnect(); }, []);
  return <div ref={ref}><button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}>🔄 {lang === 'th' ? 'หมุนดูขวด' : 'Rotate bottle'}</button>{open && visible && <div style={{ height: 220 }}><Scene model={model} color={color} /></div>}</div>;
}
