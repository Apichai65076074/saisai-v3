'use client';

// ถามด้วยเสียง (T15 · PROBLEM 3.14) — วางใน [data-slot="voice"] ของหน้าต่างแชท (T14)
// voice-mic: กดเริ่ม/หยุด · getUserMedia ใหม่ทุกครั้ง + stop() track · audio/webm;codecs=opus ≤ 30 วิ
//   → POST /api/voice → ส่งข้อความเข้าแชทเดิมผ่าน event 'saisai:voice-message' (via voice · lang ตามที่ถอดได้)
// voice-mode: ตอบเป็นเสียงอัตโนมัติ (tts:true) · GET /api/voice/status {enabled:false} → ซ่อนทั้งไมค์และ voice-mode
// มาสคอต listening ระหว่างอัด/ถอดเสียง ('saisai:voice-listening')
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatVoiceDetail } from '@/components/chat/ChatWidget';
import styles from './voice.module.css';

type Phase = 'idle' | 'requesting' | 'recording' | 'sending';
type Props = { lang?: 'th' | 'en' };

const MAX_MS = 30_000;
const MAX_BYTES = 2 * 1024 * 1024;
const POLL_MS = 3000;
const NOT_HEARD = { th: 'ไม่ได้ยินเสียง ลองพูดอีกครั้งค่ะ', en: "Sorry, I couldn't hear that. Please try again." };

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

const listening = (on: boolean) => window.dispatchEvent(new CustomEvent<boolean>('saisai:voice-listening', { detail: on }));

export default function VoiceControls({ lang = 'th' }: Props) {
  const t = (th: string, en: string) => (lang === 'en' ? en : th);
  const root = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const uploadRequest = useRef<AbortController | null>(null);
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;

  const releaseMic = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    uploadRequest.current?.abort();
    const r = recorder.current;
    recorder.current = null;
    if (r && r.state !== 'inactive') r.stop();
    releaseMic();
    setPhase('idle');
    listening(false);
  }, [releaseMic]);

  // สถานะจากหน้าต่างแชท: data-busy / data-tts-enabled ของ slot · panel ถูกซ่อน → ยกเลิกการอัด
  useEffect(() => {
    const slot = root.current?.parentElement;
    const panel = root.current?.closest('section');
    if (!slot) return;
    const read = () => {
      setBusy(slot.dataset.busy === 'true');
      setTtsEnabled(slot.dataset.ttsEnabled === 'true');
      if (panel?.hidden) cancel();
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(slot, { attributes: true, attributeFilter: ['data-busy', 'data-tts-enabled'] });
    if (panel) mo.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    return () => mo.disconnect();
  }, [cancel]);

  // GET /api/voice/status ตอนเริ่ม และทุก 3 วิขณะหน้าต่างแชทเปิด
  useEffect(() => {
    let alive = true;
    const check = async (force = false) => {
      const panel = root.current?.closest('section');
      if (!force && (panel?.hidden || document.hidden)) return;
      try {
        const r = await fetch('/api/voice/status', { cache: 'no-store' });
        const data = r.ok ? await r.json() : { enabled: false };
        if (alive) setEnabled(data.enabled === true);
      } catch {
        if (alive) setEnabled(false);
      }
    };
    void check(true);
    const id = setInterval(() => void check(), POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);
  useEffect(() => () => cancel(), [cancel]);

  async function upload(blob: Blob) {
    setPhase('sending');
    const request = new AbortController();
    uploadRequest.current = request;
    try {
      if (!blob.size) throw new Error('empty');
      if (blob.size > MAX_BYTES) throw new Error(t('เสียงยาวเกินไป ลองพูดให้สั้นลงค่ะ', 'Recording is too long. Please keep it shorter.'));
      const form = new FormData();
      form.append('audio', blob, `voice.${blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
      const r = await fetch('/api/voice', { method: 'POST', body: form, signal: request.signal });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.text) throw new Error(r.status === 422 || r.ok ? 'empty' : data.error || 'empty');
      if (cancelled.current || request.signal.aborted) return;
      const detail: ChatVoiceDetail = { text: data.text, lang: data.language === 'en' ? 'en' : 'th', tts: voiceModeRef.current };
      listening(false);
      window.dispatchEvent(new CustomEvent<ChatVoiceDetail>('saisai:voice-message', { detail }));
    } catch (e) {
      listening(false);
      const message = e instanceof Error && e.message !== 'empty' ? e.message : NOT_HEARD[lang];
      if (!cancelled.current && !request.signal.aborted) setError(message);
    } finally {
      if (uploadRequest.current === request) { uploadRequest.current = null; setPhase('idle'); }
    }
  }

  async function start() {
    setError('');
    cancelled.current = false;
    setPhase('requesting');
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      setPhase('idle');
      setError(t('เปิดไมโครโฟนไม่ได้ กรุณาอนุญาตการใช้ไมค์ค่ะ', 'Microphone unavailable. Please allow microphone access.'));
      return;
    }
    if (cancelled.current) { media.getTracks().forEach(track => track.stop()); setPhase('idle'); return; }
    stream.current = media;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(media, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
    } catch {
      releaseMic();
      setPhase('idle');
      setError(t('เบราว์เซอร์นี้อัดเสียงไม่ได้ค่ะ', 'This browser cannot record audio.'));
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      releaseMic();
      if (recorder.current === rec) recorder.current = null;
      if (cancelled.current) return;
      void upload(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
    };
    recorder.current = rec;
    rec.start(250);
    setPhase('recording');
    listening(true);
    timer.current = setTimeout(() => stop(), MAX_MS);
  }

  function stop() {
    const rec = recorder.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  if (!enabled) return <div ref={root} className={styles.voice} data-voice-enabled="false" />;
  const recording = phase === 'recording';
  return (
    <div ref={root} className={styles.voice} data-voice-enabled="true">
      <button
        type="button"
        data-testid="voice-mic"
        data-phase={phase}
        className={styles.mic}
        disabled={phase === 'requesting' || phase === 'sending' || (busy && !recording)}
        aria-pressed={recording}
        aria-label={recording ? t('หยุดอัดเสียงแล้วส่ง', 'Stop recording and send') : t('กดเพื่อถามด้วยเสียง', 'Ask by voice')}
        title={recording ? t('กดอีกครั้งเพื่อส่ง', 'Press again to send') : t('ถามด้วยเสียง (ไม่เกิน 30 วินาที)', 'Ask by voice (up to 30 s)')}
        onClick={() => (recording ? stop() : void start())}
      >
        {recording ? '■' : '🎙'}
      </button>
      {ttsEnabled && (
        <label className={styles.mode}>
          <input type="checkbox" data-testid="voice-mode" checked={voiceMode} onChange={(e) => setVoiceMode(e.target.checked)} />
          {t('ตอบเป็นเสียง', 'Voice replies')}
        </label>
      )}
      {recording && <span className={styles.hint} role="status">{t('กำลังฟัง… กดอีกครั้งเพื่อส่ง', 'Listening… press again to send')}</span>}
      {phase === 'sending' && <span className={styles.hint} role="status">{t('กำลังถอดเสียง…', 'Transcribing…')}</span>}
      {error && <span className={styles.error} data-testid="voice-error" role="alert">{error}</span>}
    </div>
  );
}
