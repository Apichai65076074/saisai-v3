'use client';
import { Canvas } from '@react-three/fiber';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function Stage({ children, fallback, camera = [0, 1, 9] }: { children: ReactNode; fallback: ReactNode; camera?: [number, number, number] }) {
  const root = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    setSupported(!!context);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => { setActive(visible && !document.hidden); setReduced(media.matches); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', update);
    media.addEventListener('change', update);
    update();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); media.removeEventListener('change', update); };
  }, []);
  return <div ref={root} style={{ width: '100%', height: '100%' }} data-motion={reduced ? 'reduced' : 'full'}>
    {supported ? <Boundary fallback={fallback}><Canvas dpr={[1, 2]} frameloop={active ? reduced ? 'demand' : 'always' : 'never'} camera={{ position: camera, fov: 42 }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); setSupported(false); }, { once: true }); }}><ambientLight intensity={1.8} /><directionalLight position={[4, 7, 5]} intensity={3} />{children}</Canvas></Boundary> : fallback}
  </div>;
}
