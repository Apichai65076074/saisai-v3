'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { Bottle, bottles } from './Bottle';
import Stage from './Stage';
function Factory({ mobile }: { mobile: boolean }) {
  useFrame(({ camera }) => {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const progress = Math.min(window.scrollY / 700, 1);
      camera.position.z = 12 - progress * 4;
      camera.position.y = 2 - progress;
      camera.lookAt(0, 0, 0);
    }
  });
  return <><color attach="background" args={['#e3f4f4']} />{bottles.slice(0, mobile ? 4 : 9).map(([model, color], i) => <Bottle key={model + color} model={model} color={color} position={[(i % (mobile ? 2 : 5) - (mobile ? .5 : 2)) * 1.35, i < (mobile ? 2 : 5) ? 1 : -1.3, 0]} />)}
    <mesh position={[0, -2.25, 0]}><boxGeometry args={[15, .3, 2]} /><meshStandardMaterial color="#0B2E3F" /></mesh>
    {Array.from({ length: 24 }, (_, i) => <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[-7 + i * .6, -2.05, 0]}><cylinderGeometry args={[.13, .13, 2, 12]} /><meshStandardMaterial color="#678e98" metalness={.7} roughness={.3} /></mesh>)}
  </>;
}
export default function HeroScene() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const m = matchMedia('(max-width: 600px)'); const update = () => setMobile(m.matches); update(); m.addEventListener('change', update); return () => m.removeEventListener('change', update); }, []);
  return <section data-testid="hero-3d" style={{ height: 520, position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#e3f4f4' }}>
    <Stage camera={[0, 2, 12]} fallback={<img data-testid="hero-image" src="/img/banner-factory-3d.webp" alt="โรงงานขวดแก้ว SaiSai" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />}><Factory mobile={mobile} /></Stage>
    <div style={{ position: 'absolute', bottom: 18, left: 18, right: 18, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{bottles.slice(0, mobile ? 4 : 9).map(([model, color]) => <a key={model + color} data-testid="bottle-3d" data-model={model} data-color={color} href={`/order?model=${model}&color=${color}`} style={{ background: '#ffffffed', color: '#0B2E3F', padding: '5px 9px', borderRadius: 12, fontSize: 12 }}>{model} · {color}</a>)}</div>
  </section>;
}
