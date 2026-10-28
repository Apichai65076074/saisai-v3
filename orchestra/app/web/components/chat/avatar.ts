'use client';
import { useSyncExternalStore } from 'react';
export type ChatAvatarState = 'idle' | 'listening' | 'thinking' | 'talking';
let state: ChatAvatarState = 'idle';
const listeners = new Set<() => void>();
/** Live binding: the one shared audio element, suitable for a single AnalyserNode. */
export let chatAudioElement: HTMLAudioElement | null = null;
export function setChatAudioElement(element: HTMLAudioElement | null) { chatAudioElement = element; }
export function setChatAvatarState(next: ChatAvatarState) {
  if (next === state) return;
  state = next;
  listeners.forEach((notify) => notify());
}
export function useChatAvatarState(): ChatAvatarState {
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; }, () => state, () => 'idle');
}
