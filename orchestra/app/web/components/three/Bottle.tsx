'use client';
import { MeshTransmissionMaterial } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
export const bottles = [
  ['B-100', 'clear'], ['B-100', 'amber'], ['B-150', 'clear'], ['B-150', 'amber'],
  ['B-250', 'clear'], ['B-250', 'amber'], ['B-250', 'green'], ['B-500', 'clear'], ['B-500', 'amber'],
] as const;
export function Bottle({ model, color, position = [0, 0, 0], spin = true, navigate = true }: { model: string; color: string; position?: [number, number, number]; spin?: boolean; navigate?: boolean }) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => { if (group.current && spin && !matchMedia('(prefers-reduced-motion: reduce)').matches) group.current.rotation.y += Math.min(delta, .05) * .35; });
  const size = model === 'B-500' ? 1.12 : model === 'B-100' ? .76 : model === 'B-150' ? .86 : 1;
  return <group ref={group} position={position} scale={size} onClick={() => { if (navigate) location.href = `/order?model=${model}&color=${color}`; }}>
    <mesh><cylinderGeometry args={[.38, .4, 1.3, 24]} /><MeshTransmissionMaterial color={color === 'green' ? '#238554' : color === 'amber' ? '#A0522D' : '#c5f0f5'} transmission={.92} thickness={.22} roughness={.16} samples={2} resolution={128} /></mesh>
    <mesh position={[0, .72, 0]}><sphereGeometry args={[.38, 24, 12]} /><meshPhysicalMaterial color={color === 'green' ? '#238554' : color === 'amber' ? '#A0522D' : '#c5f0f5'} transparent opacity={.7} /></mesh>
    <mesh position={[0, 1.02, 0]}><cylinderGeometry args={[.17, .2, .42, 20]} /><meshPhysicalMaterial color="#a8d8df" transparent opacity={.8} /></mesh>
    <mesh position={[0, 1.25, 0]}><cylinderGeometry args={[.19, .19, .12, 20]} /><meshStandardMaterial color="#A0522D" metalness={.4} roughness={.3} /></mesh>
    <mesh position={[0, -.08, .39]}><planeGeometry args={[.48, .55]} /><meshStandardMaterial color="#f4edda" /></mesh>
  </group>;
}
