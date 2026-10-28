'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { chatAudioElement, setChatAvatarState, useChatAvatarState, type ChatAvatarState } from '../chat/avatar';
const Scene = dynamic(() => import('./MascotScene'), { ssr: false });
type Graph = { context: AudioContext; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> };
const graphs = new WeakMap<HTMLAudioElement, Graph>();
function graphFor(audio: HTMLAudioElement): Graph {
  const existing = graphs.get(audio);
  if (existing) return existing;
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser(); analyser.fftSize = 256;
  source.connect(analyser); analyser.connect(context.destination);
  const graph = { context, analyser, samples: new Float32Array(analyser.fftSize) };
  graphs.set(audio, graph); return graph;
}
declare global { interface Window { __saisaiMascot?: { play: (url: string) => Promise<void>; state: (state: ChatAvatarState) => void } } }
export default function Mascot3D({ allowTest = false }: { allowTest?: boolean }) {
  const state = useChatAvatarState();
  const root = useRef<HTMLDivElement>(null);
  const mouth = useRef(0);
  useEffect(() => {
    let attached: HTMLAudioElement | null = null;
    let graph: Graph | null = null;
    const wrapper = () => root.current?.closest('[data-testid="mascot"]');
    const zero = () => { mouth.current = 0; wrapper()?.setAttribute('data-mouth', '0.00'); };
    const play = () => { if (attached) { try { graph = graphFor(attached); void graph.context.resume().catch(() => {}); } catch { graph = null; } } };
    const timer = window.setInterval(() => {
      if (chatAudioElement !== attached) {
        attached?.removeEventListener('play', play);
        attached?.removeEventListener('ended', zero);
        attached?.removeEventListener('pause', zero);
        attached = chatAudioElement;
        attached?.addEventListener('play', play);
        attached?.addEventListener('ended', zero);
        attached?.addEventListener('pause', zero);
        if (attached && !attached.paused) play();
      }
      if (!attached || attached.paused || attached.ended || document.hidden || !graph) { zero(); return; }
      graph.analyser.getFloatTimeDomainData(graph.samples);
      const rms = Math.sqrt(graph.samples.reduce((sum, value) => sum + value * value, 0) / graph.samples.length);
      mouth.current = Math.min(1, rms * 4);
      wrapper()?.setAttribute('data-mouth', mouth.current.toFixed(2));
    }, 50);
    if (allowTest) window.__saisaiMascot = {
      state: setChatAvatarState,
      async play(url) {
        const audio = chatAudioElement;
        if (!audio) throw new Error('Chat audio is not mounted');
        // The shared audio keeps the same WebAudio source as production TTS.
        audio.src = url;
        graph = graphFor(audio);
        await graph.context.resume();
        await audio.play();
      },
    };
    return () => { clearInterval(timer); attached?.removeEventListener('play', play); attached?.removeEventListener('ended', zero); attached?.removeEventListener('pause', zero); zero(); if (allowTest) delete window.__saisaiMascot; };
  }, [allowTest]);
  return <div ref={root} style={{ width: 52, height: 52 }}><Scene state={state} mouth={mouth} /></div>;
}
