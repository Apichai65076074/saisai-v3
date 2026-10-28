// Isolated UI contract test: all chat/voice network calls are mocked; no GPU or MQ.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../../../e2e/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
// One-second PCM WAV for both stub URLs and an actual HTMLAudioElement smoke test.
const wav = Buffer.alloc(44 + 16000 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 16000; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 16000) * 1000), 44 + i * 2);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.route(/\/api\/tts\/(?!status)[^/]+$/, (route) => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.route('**/api/chat/history', (route) => route.fulfill({ json: { messages: [{ id: 1, role: 'assistant', text: 'ประวัติเดิม', cites: [] }] } }));
  await page.route('**/api/tts/status', (route) => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/tts', async (route) => {
    const body = route.request().postDataJSON();
    assert.ok(body.text.includes('คำตอบ'));
    await route.fulfill({ json: { audioId: 'manual', durationMs: 1000, engine: 'mock', lang: 'th' } });
  });
  await page.addInitScript(() => {
    window.plays = [];
    window.requests = [];
    window.stubScenario = 'normal';
    const original = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      if (url !== '/api/chat') return original(url, init);
      const body = JSON.parse(init.body);
      window.requests.push(body);
      const scenario = window.stubScenario;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          function emit(event) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
          emit({ type: 'status', text: 'กำลังคิด…' });
          if (scenario === 'error') {
            setTimeout(() => { emit({ type: 'error', text: 'ระบบไม่พร้อมค่ะ' }); controller.close(); }, 200);
            return;
          }
          setTimeout(() => emit({ type: 'delta', text: 'คำตอบสด' }), 100);
          setTimeout(() => emit({ type: 'sentence', seq: 1, text: 'คำตอบสด' }), 200);
          setTimeout(() => emit({ type: 'tts', seq: 2, audioId: '2', lang: 'en' }), 300);
          setTimeout(() => emit({ type: 'tts', seq: 1, audioId: '1', lang: 'en' }), 450);
          setTimeout(() => emit({ type: 'tts', seq: 3, audioId: '3', lang: 'en' }), 1400);
          setTimeout(() => emit({ type: 'done', text: 'คำตอบสดครบสามประโยค', lang: 'en', cites: [{ filename: 'SS TEST.pdf', page: 7 }, { filename: 'SS TEST.pdf', page: 7 }] }), 1300);
          setTimeout(() => controller.close(), 1650);
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    };
    // Model audio device with predictable ended events; record what the real queue plays.
    HTMLMediaElement.prototype.play = function () {
      window.plays.push({ seq: this.dataset.seq, lang: this.dataset.lang, src: this.getAttribute('src'), beforeDone: document.querySelectorAll('[data-testid="chat-msg-bot"][data-done="false"]').length > 0 });
      this.dispatchEvent(new Event('playing'));
      setTimeout(() => this.dispatchEvent(new Event('ended')), 160);
      return Promise.resolve();
    };
  });
  await page.goto(process.env.BASE_URL || 'http://localhost:4602');
  await page.getByTestId('chat-open').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await expect(page.getByTestId('chat-msg-bot')).toHaveText('ประวัติเดิม🔊');
  assert.equal(await page.getByTestId('chat-audio').count(), 1);
  for (let n = 1; n <= 3; n++) await expect(page.getByTestId(`chat-suggest-${n}`)).toBeVisible();
  await page.getByTestId('tts-auto').check();
  await page.getByTestId('chat-input').pressSequentially('สวัสดี', { delay: 60 });
  await page.getByTestId('chat-send').click();
  const bot = page.getByTestId('chat-msg-bot').last();
  await expect(bot).toContainText('คำตอบสด');
  await expect(bot).toHaveAttribute('data-done', 'false');
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-state', /thinking|talking/);
  await expect(bot).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('chat-input')).toBeEnabled();
  const clips = await page.evaluate(() => window.plays);
  assert.deepEqual(clips.map((c) => c.seq), ['1', '2', '3']);
  assert.ok(clips[0].beforeDone);
  assert.equal(clips[2].beforeDone, false); // Late TTS must survive textual done.
  assert.ok(clips.every((c) => c.lang === 'en'));
  const request = await page.evaluate(() => window.requests[0]);
  assert.equal(request.tts, true);
  const cite = page.getByTestId('chat-cite');
  assert.equal(await cite.count(), 1);
  await expect(cite).toHaveAttribute('href', '/api/docs/SS%20TEST.pdf#page=7');
  await expect(cite).toHaveAttribute('target', '_blank');
  await expect(cite).toHaveAttribute('data-page', '7');
  await expect(cite).toHaveText('📄 SS TEST.pdf · หน้า 7');
  await bot.getByTestId('tts-play').click();
  await expect.poll(async () => (await page.evaluate(() => window.plays)).length).toBe(4);
  assert.equal((await page.evaluate(() => window.plays)).at(-1).src, '/api/tts/manual');

  // Stop automatic playback while replies are still being delivered.
  await page.getByTestId('chat-suggest-1').click();
  await expect(page.getByTestId('chat-msg-bot').last()).toContainText('คำตอบสด');
  await page.getByTestId('tts-auto').uncheck();
  await expect(page.getByTestId('chat-input')).toBeEnabled();
  assert.equal((await page.evaluate(() => window.plays)).length, 4);

  // T15 bridge preserves via:voice and the dedicated transcript selector.
  await page.evaluate(() => { window.stubScenario = 'error'; window.dispatchEvent(new CustomEvent('saisai:voice-message', { detail: { text: 'เสียงทดสอบ', lang: 'th' } })); });
  await expect(page.getByTestId('chat-msg-voice')).toHaveText('เสียงทดสอบ');
  await expect(page.getByTestId('chat-msg-bot').last()).toContainText('ระบบไม่พร้อมค่ะ');
  await expect(page.getByTestId('chat-msg-bot').last()).toHaveAttribute('data-done', 'true');
  assert.equal((await page.evaluate(() => window.requests)).at(-1).via, 'voice');
  await expect(page.getByTestId('chat-input')).toBeEnabled();
  await page.getByTestId('chat-input').press('Escape');
  await expect(page.getByTestId('chat-panel')).toBeHidden();

  // Consumers unavailable: no TTS controls, including on saved answers.
  await page.route('**/api/tts/status', (route) => route.fulfill({ json: { enabled: false } }));
  await page.getByTestId('chat-open').click();
  await expect(page.getByTestId('tts-auto')).toHaveCount(0);
  await expect(page.getByTestId('tts-play')).toHaveCount(0);
  assert.deepEqual(errors, []);

  // Real browser audio playback (no play() replacement) with a valid mock WAV.
  const nativePage = await browser.newPage();
  await nativePage.route('**/api/chat/history', (route) => route.fulfill({ json: { messages: [{ id: 9, role: 'assistant', text: 'คำตอบภาษาไทย', lang: 'th', cites: [] }] } }));
  await nativePage.route('**/api/tts/status', (route) => route.fulfill({ json: { enabled: true } }));
  await nativePage.route('**/api/tts', (route) => route.fulfill({ json: { audioId: 'wav', engine: 'mock', durationMs: 1000, lang: 'th' } }));
  await nativePage.route('**/api/tts/wav', (route) => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await nativePage.goto(process.env.BASE_URL || 'http://localhost:4602');
  await nativePage.getByTestId('chat-open').click();
  await nativePage.getByTestId('tts-play').click();
  await expect(nativePage.getByTestId('mascot')).toHaveAttribute('data-state', 'talking');
  await expect(nativePage.getByTestId('chat-audio')).toHaveAttribute('data-lang', 'th');
  assert.equal(await nativePage.getByTestId('chat-audio').evaluate((el) => el.paused), false);
  await expect(nativePage.getByTestId('mascot')).toHaveAttribute('data-state', 'idle');
  await nativePage.close();
  console.log('PASS: history, suggestions, live delta/done, PDF cite, ordered 2/1/3 → 1/2/3 before done, manual TTS, auto-off, voice bridge, error, close, unavailable TTS; no browser exceptions; native WAV playback and talking/idle avatar');
} finally {
  await browser.close();
}
