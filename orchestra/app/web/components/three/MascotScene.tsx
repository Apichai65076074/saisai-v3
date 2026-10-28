'use client';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import type { ChatAvatarState } from '../chat/avatar';
import Stage from './Stage';
function Character({ state, mouth }: { state: ChatAvatarState; mouth: { current: number } }) {
  const body = useRef<Group>(null), lips = useRef<Mesh>(null), bubbles = useRef<Group>(null), eyes = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (lips.current) lips.current.scale.y = .15 + mouth.current * 2.2;
    if (body.current) { body.current.rotation.z = state === 'listening' ? .17 : 0; body.current.rotation.x = state === 'thinking' ? -.12 : 0; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = clock.elapsedTime;
    if (eyes.current) eyes.current.scale.y = state === 'idle' && t % 4 > 3.85 ? .08 : 1;
    if (body.current) { body.current.rotation.z = state === 'listening' ? .17 : Math.sin(t * 1.8) * .035; body.current.rotation.x = state === 'thinking' ? -.12 : 0; body.current.position.y = Math.sin(t * 2) * .04; }
    if (bubbles.current) { bubbles.current.rotation.y = t * (state === 'thinking' ? 2 : .4); bubbles.current.position.y = Math.sin(t) * .1; }
  });
  return <group ref={body}>
    <mesh><sphereGeometry args={[.85, 24, 20]} /><meshPhysicalMaterial color="#a8e5e9" transparent opacity={.58} roughness={.18} metalness={.1} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .87, state === 'listening' ? .24 : -.12, .05]} rotation={[0, 0, side * -.5]} scale={[.2, .35, .2]}><sphereGeometry args={[1, 16, 12]} /><meshPhysicalMaterial color="#a8e5e9" transparent opacity={.75} roughness={.2} /></mesh>
      <mesh position={[side * .42, -.8, .2]} scale={[.28, .16, .35]}><sphereGeometry args={[1, 16, 12]} /><meshPhysicalMaterial color="#a8e5e9" transparent opacity={.75} roughness={.2} /></mesh>
    </group>)}
    <mesh position={[0, .73, 0]}><cylinderGeometry args={[.36, .38, .35, 20]} /><meshPhysicalMaterial color="#a8e5e9" transparent opacity={.6} /></mesh>
    <mesh position={[0, 1, 0]} rotation={[0, 0, -.08]}><cylinderGeometry args={[.32, .4, .3, 20]} /><meshStandardMaterial color="#A0522D" /></mesh>
    <group ref={eyes}>{[-.29, .29].map(x => <group key={x} position={[x, .2, .74]}><mesh><sphereGeometry args={[.19, 16, 12]} /><meshStandardMaterial color="white" /></mesh><mesh position={[0, state === 'thinking' ? .07 : .01, .15]} scale={[1, state === 'idle' ? .85 : 1, 1]}><sphereGeometry args={[.09, 12, 12]} /><meshStandardMaterial color="#0B2E3F" /></mesh><mesh position={[x < 0 ? -.12 : .12, -.28, -.02]} scale={[1, .5, .3]}><sphereGeometry args={[.14, 12, 12]} /><meshStandardMaterial color="#f6a6b5" /></mesh></group>)}</group>
    <mesh ref={lips} position={[0, -.21, .83]} scale={[1, .15, 1]}><sphereGeometry args={[.14, 16, 12]} /><meshStandardMaterial color="#6f3442" /></mesh>
    <group ref={bubbles}>{[-.4, 0, .4].map((x, i) => <mesh key={i} position={[x, -.4 + i * .23, .1]}><sphereGeometry args={[.08, 12, 12]} /><meshStandardMaterial color="#fff" transparent opacity={.75} /></mesh>)}</group>
    {state === 'listening' && [1, 1.2].map(r => <mesh key={r} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[r, .018, 8, 32]} /><meshStandardMaterial color="#0E7C9B" /></mesh>)}
    {state === 'thinking' && [-.3, 0, .3].map(x => <mesh key={x} position={[x, 1.3, 0]}><sphereGeometry args={[.065, 10, 10]} /><meshStandardMaterial color="#0E7C9B" /></mesh>)}
  </group>;
}
export default function MascotScene({ state, mouth }: { state: ChatAvatarState; mouth: { current: number } }) {
  return <Stage camera={[0, .25, 3.8]} fallback={<img src={`/img/mascot/nongsai-${state}.webp`} alt="น้องใส · Nong Sai" width={52} height={52} onError={e => { e.currentTarget.style.display = 'none'; }} />}><Character state={state} mouth={mouth} /></Stage>;
}
