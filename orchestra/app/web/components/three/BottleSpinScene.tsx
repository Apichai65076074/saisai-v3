'use client';
import { OrbitControls } from '@react-three/drei';
import { Bottle } from './Bottle';
import Stage from './Stage';
export default function BottleSpinScene({ model, color }: { model: string; color: string }) {
  return <Stage camera={[0, .7, 4]} fallback={<img src={`/assets/bottle-${model.toLowerCase().replace('-', '')}-${color}.png`} alt={`${model} ${color}`} style={{ height: 200 }} onError={e => { e.currentTarget.style.display = 'none'; }} />}><Bottle model={model} color={color} navigate={false} /><OrbitControls enableZoom={false} enablePan={false} /></Stage>;
}
