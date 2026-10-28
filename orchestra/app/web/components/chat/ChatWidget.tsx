'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChatAudioQueue, type AudioClip } from './audioQueue';
import { readChatStream, type ChatEvent } from './sse';
import { setChatAudioElement, setChatAvatarState, useChatAvatarState } from './avatar';
import styles from './chat.module.css';

export { chatAudioElement, useChatAvatarState } from './avatar';
type Cite = { filename: string; page: number };
type Message = { id: string; role: 'user' | 'assistant'; text: string; cites: Cite[]; via?: string; done: boolean; lang?: string; quoteNo?: string; failed?: boolean };
export type ChatVoiceDetail = { text: string; lang?: 'th' | 'en'; tts?: boolean };
type Props = { lang?: 'th' | 'en'; identity?: string; voiceSlot?: ReactNode; mascotSlot?: ReactNode };

export default function ChatWidget({ lang = 'th', identity = '', voiceSlot, mascotSlot }: Props) {
  const t = (th: string, en: string) => lang === 'en' ? en : th;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [auto, setAuto] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [talking, setTalking] = useState(false);
  const [listening, setListening] = useState(false);
  const avatar = useChatAvatarState();
  const audio = useRef<HTMLAudioElement | null>(null);
  const stream = useRef<AbortController | null>(null);
  const manual = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const autoPlayback = useRef(false);
  const queue = useRef<ChatAudioQueue | null>(null);
  const inputElement = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audio.current = element;
    setChatAudioElement(element);
  }, []);

  if (!queue.current) queue.current = new ChatAudioQueue(async (clip: AudioClip) => {
    const element = audio.current;
    if (!element) return;
    element.dataset.seq = String(clip.seq);
    element.dataset.lang = clip.lang;
    element.src = `/api/tts/${encodeURIComponent(clip.audioId)}`;
    await element.play();
  }, () => { setTalking(false); setAudioBlocked(true); });

  const stopAudio = useCallback(() => {
    manual.current?.abort();
    autoPlayback.current = false;
    queue.current?.reset();
    audio.current?.pause();
    audio.current?.removeAttribute('src');
    setTalking(false);
    setAudioBlocked(false);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    stream.current?.abort();
    stream.current = null;
    stopAudio();
    setMessages([]);
    setLoading(true);
    setBusy(false);
    setThinking(false);
    inFlight.current = false;
    setStatus('');
    void fetch('/api/chat/history', { signal: abort.signal, cache: 'no-store' }).then(async (r) => {
      if (!r.ok) throw new Error('History unavailable');
      const data = await r.json();
      if (!abort.signal.aborted) setMessages((data.messages ?? []).filter((m: Message) => m.role === 'user' || m.role === 'assistant').map((m: Message) => ({ ...m, id: String(m.id), cites: m.cites ?? [], done: true })));
    }).catch(() => {
      if (!abort.signal.aborted) setStatus(lang === 'en' ? 'Could not load history. You can still send a question.' : 'โหลดประวัติไม่ได้ แต่ยังส่งคำถามได้ค่ะ');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); stream.current?.abort(); stopAudio(); };
  }, [identity, stopAudio, lang]);

  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const check = () => { void fetch('/api/tts/status', { signal: abort.signal, cache: 'no-store' }).then((r) => r.ok ? r.json() : { enabled: false }).then((data) => {
      if (!abort.signal.aborted) { setTtsEnabled(data.enabled === true); if (!data.enabled) { setAuto(false); stopAudio(); } }
    }).catch(() => { if (!abort.signal.aborted) { setTtsEnabled(false); setAuto(false); stopAudio(); } }); };
    check();
    const timer = setInterval(check, 15000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [open, stopAudio]);

  useEffect(() => { setChatAvatarState(talking ? 'talking' : listening ? 'listening' : thinking ? 'thinking' : 'idle'); }, [talking, listening, thinking]);
  useEffect(() => () => { setChatAvatarState('idle'); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, status, open]);
  useEffect(() => {
    if (open && !loading && !busy && focusOnOpen.current) { inputElement.current?.focus(); focusOnOpen.current = false; }
  }, [open, loading, busy]);

  async function send(text: string, via: 'text' | 'voice' = 'text', voice?: ChatVoiceDetail) {
    if (!text.trim() || loading || inFlight.current) return;
    inFlight.current = true;
    stopAudio();
    const abort = new AbortController();
    stream.current = abort;
    const id = crypto.randomUUID();
    const answer = `${id}-bot`;
    const requestAuto = ttsEnabled && (voice?.tts ?? auto);
    autoPlayback.current = requestAuto;
    const change = (fn: (m: Message) => Message) => setMessages((old) => old.map((m) => m.id === answer ? fn(m) : m));
    setInput('');
    setBusy(true);
    setThinking(true);
    setStatus(t('กำลังคิด…', 'Thinking…'));
    setMessages((old) => [...old, { id, role: 'user', text: text.trim(), via, cites: [], done: true }, { id: answer, role: 'assistant', text: '', cites: [], done: false }]);
    let finished = false;
    const receive = (event: ChatEvent) => {
      if (abort.signal.aborted) return;
      if (event.type === 'status') setStatus(event.text ?? '');
      if (event.type === 'delta') change((m) => ({ ...m, text: m.text + (event.text ?? '') }));
      if (event.type === 'sentence' && Number.isInteger(event.seq)) queue.current?.announce(event.seq!);
      if (event.type === 'tts' && requestAuto && autoPlayback.current && Number.isInteger(event.seq) && event.audioId) {
        queue.current?.add({ seq: event.seq!, audioId: event.audioId, lang: event.lang ?? voice?.lang ?? lang });
      }
      if (event.type === 'done' || event.type === 'error') {
        finished = true;
        setThinking(false);
        change((m) => ({ ...m, text: event.text || m.text, done: true, failed: event.type === 'error', cites: event.cites ?? m.cites, lang: event.lang, quoteNo: event.quoteNo }));
        setStatus('');
        // Keep reading: TTS replies may arrive after done.
      }
    };
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.trim(), lang: voice?.lang ?? lang, via, tts: requestAuto }), signal: abort.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.errors?.[0]?.message || data.error || t('ส่งคำถามไม่ได้ ลองใหม่อีกครั้งค่ะ', 'Could not send. Please try again.'));
      }
      await readChatStream(response, receive);
      if (!finished) throw new Error(t('การเชื่อมต่อขาดหาย กรุณาลองใหม่ค่ะ', 'Connection interrupted. Please try again.'));
    } catch (error) {
      if (!abort.signal.aborted) {
        const text = error instanceof Error ? error.message : t('เกิดข้อผิดพลาด ลองใหม่ค่ะ', 'Please try again.');
        if (!finished) change((m) => ({ ...m, text: m.text ? `${m.text}\n${text}` : text, done: true, failed: true }));
        setStatus(text);
      }
    } finally {
      if (stream.current === abort) { inFlight.current = false; setBusy(false); setThinking(false); stream.current = null; }
    }
  }

  // T15 can dispatch recognized speech without creating a second chat/SSE client.
  useEffect(() => {
    const voice = (event: Event) => { const detail = (event as CustomEvent<ChatVoiceDetail>).detail; if (detail?.text) { setOpen(true); void send(detail.text, 'voice', detail); } };
    const listeningEvent = (event: Event) => setListening(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener('saisai:voice-message', voice);
    window.addEventListener('saisai:voice-listening', listeningEvent);
    return () => { window.removeEventListener('saisai:voice-message', voice); window.removeEventListener('saisai:voice-listening', listeningEvent); };
  });

  async function playMessage(message: Message) {
    stopAudio();
    const abort = new AbortController();
    manual.current = abort;
    try {
      const response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message.text, lang: message.lang ?? lang }), signal: abort.signal });
      if (!response.ok) throw new Error(t('อ่านออกเสียงไม่ได้ ลองใหม่ค่ะ', 'Audio unavailable. Please try again.'));
      const data = await response.json();
      if (!abort.signal.aborted) queue.current?.add({ seq: 1, audioId: data.audioId, lang: data.lang ?? message.lang ?? lang });
    } catch (error) { if (!abort.signal.aborted) setStatus(error instanceof Error ? error.message : 'Audio unavailable'); }
  }

  function close() { setOpen(false); stopAudio(); setListening(false); }
  const suggestions = lang === 'en' ? ['What bottles do you sell?', 'What is the minimum order?', 'How can I request samples?'] : ['มีขวดแก้วรุ่นไหนบ้าง', 'สั่งซื้อขั้นต่ำกี่ใบ', 'ขอตัวอย่างขวดได้อย่างไร'];
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };

  return <div className={styles.widget}>
    <button className={styles.launcher} data-testid="chat-open" aria-expanded={open} aria-controls="saisai-chat" onClick={() => { focusOnOpen.current = true; setOpen(true); }}>💬 {t('คุยกับน้องใส', 'Chat with Nong Sai')}</button>
    <section id="saisai-chat" data-testid="chat-panel" aria-label={t('คุยกับน้องใส', 'Chat with Nong Sai')} className={styles.panel} hidden={!open} onKeyDown={(e) => { if (e.key === 'Escape') { close(); document.querySelector<HTMLButtonElement>('[data-testid="chat-open"]')?.focus(); } }}>
      <header className={styles.header}>
        <div data-testid="mascot" data-state={avatar} data-mouth="0.00" className={styles.mascot}>
          {mascotSlot ?? <img key={avatar} src={`/img/mascot/nongsai-${avatar}.webp`} alt={t('น้องใส', 'Nong Sai')} width={52} height={52} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        </div>
        <div><strong>{t('น้องใส', 'Nong Sai')}</strong><small>{t('ผู้ช่วยเรื่องขวดแก้ว', 'Your glass bottle assistant')}</small></div>
        <button data-testid="chat-close" className={styles.close} onClick={close} aria-label={t('ปิดแชท', 'Close chat')}>×</button>
      </header>
      <div className={styles.messages} role="log" aria-label={t('ข้อความแชท', 'Chat messages')} aria-live="polite" aria-relevant="additions text">
        {!messages.length && <p className={styles.welcome}>{t('สวัสดีค่ะ ถามเรื่องขวดแก้ว ราคา หรือการสั่งซื้อได้เลยค่ะ', 'Hello! Ask about our bottles, prices or ordering.')}</p>}
        {messages.map((message) => <article key={message.id} data-testid={message.role === 'user' ? 'chat-msg-user' : 'chat-msg-bot'} data-done={message.done ? 'true' : 'false'} className={`${styles.bubble} ${message.role === 'user' ? styles.user : styles.bot}`}>
          <div data-testid={message.via === 'voice' ? 'chat-msg-voice' : undefined} className={styles.text}>{message.text}</div>
          {message.cites.filter((cite, index, all) => Number.isInteger(cite.page) && cite.page > 0 && all.findIndex((other) => other.filename === cite.filename && other.page === cite.page) === index).map((cite) => <a key={`${cite.filename}-${cite.page}`} className={styles.cite} data-testid="chat-cite" data-filename={cite.filename} data-page={cite.page} href={`/api/docs/${encodeURIComponent(cite.filename)}#page=${cite.page}`} target="_blank" rel="noopener noreferrer">📄 {cite.filename} · หน้า {cite.page}</a>)}
          {message.quoteNo && <a className={styles.cite} href={`/quotes/${encodeURIComponent(message.quoteNo)}`}>{message.quoteNo}</a>}
          {ttsEnabled && message.role === 'assistant' && message.done && message.text && !message.failed && <button data-testid="tts-play" className={styles.play} disabled={busy} aria-label={t('อ่านคำตอบออกเสียง', 'Read answer aloud')} onClick={() => void playMessage(message)}>🔊</button>}
        </article>)}
        <div ref={bottom} />
      </div>
      <div data-testid="chat-status" className={styles.status} role="status">{loading ? t('กำลังโหลดประวัติ…', 'Loading history…') : status}</div>
      <div className={styles.suggestions}>{suggestions.map((text, index) => <button key={index} data-testid={`chat-suggest-${index + 1}`} disabled={busy || loading} onClick={() => void send(text)}>{text}</button>)}</div>
      <div className={styles.tools}>
        {ttsEnabled && <label className={styles.auto}><input type="checkbox" data-testid="tts-auto" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (!e.target.checked) stopAudio(); }} />{t('อ่านออกเสียงอัตโนมัติ', 'Read replies aloud')}</label>}
        <div data-slot="voice" data-busy={busy || loading} data-tts-enabled={ttsEnabled}>{voiceSlot}</div>
      </div>
      {audioBlocked && <button className={styles.resume} onClick={() => { setAudioBlocked(false); queue.current?.retry(); }}>{t('▶ แตะเพื่อเล่นเสียงต่อ', '▶ Tap to resume audio')}</button>}
      <form className={styles.form} onSubmit={submit}>
        <input ref={inputElement} data-testid="chat-input" aria-label={t('พิมพ์คำถาม', 'Your question')} placeholder={t('พิมพ์คำถาม…', 'Type a question…')} value={input} maxLength={8000} disabled={busy || loading} onChange={(e) => setInput(e.target.value)} />
        <button data-testid="chat-send" type="submit" disabled={busy || loading || !input.trim()}>{t('ส่ง', 'Send')}</button>
      </form>
    </section>
    <audio ref={attachAudio} data-testid="chat-audio" preload="auto" onPlaying={() => { setTalking(true); setAudioBlocked(false); }} onPause={() => setTalking(false)} onEnded={() => { setTalking(false); queue.current?.ended(); }} onError={() => { setTalking(false); setStatus(t('เล่นเสียงไม่ได้ ลองกดอ่านออกเสียงอีกครั้งค่ะ', 'Could not play audio. Please try again.')); queue.current?.ended(); }} />
  </div>;
}
