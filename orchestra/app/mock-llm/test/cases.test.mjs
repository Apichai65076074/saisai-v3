import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answer, thaiNumber } from '../lib/llm.mjs';
import { createServer } from '../server.mjs';
import { processBytes, toneWav, digest } from '../lib/audio.mjs';
import { ctx, messages, page, pages, user, assistant } from './context.mjs';
import ffmpeg from 'ffmpeg-static';
process.env.FFMPEG_BIN ||= ffmpeg;
const ask = (q, extra = {}, history = []) => answer(messages(q, extra, history));
const tag = (q, expected = 'PRICE', history = [], extra = {}) => {
  const a = ask(q, extra, history);
  assert.ok(a.startsWith(`[${expected}]`), a);
  return JSON.parse(a.slice(expected.length + 2));
};
const result = (kind, data, q = '', history = [], extra = {}) => ask(`${kind}_RESULT: ${JSON.stringify(data)}`, extra, [...history, user(q), assistant(`[${kind}]{}`)]);
const price = { ok: true, lines: { bottles: '58000.00', discount: '2900.00', discountRate: '0.05', logo: '8000.00', shipping: '1500.00', trips: 1, subtotal: '64600.00', vat: '4522.00', total: '69122.00' }, earliestPickup: '2026-10-25' };
for (const [id, q, expected] of [
  ['C01', 'ติดต่อเซลส์ได้ทางไหน', /02-000-0000.*@saisai-test/],
  ['C02', 'มีขวดกี่แบบ', /9.*100\/150\/250\/500/],
  ['C03', 'ขวด 250 มล. สีเขียวใบละเท่าไร', /5\.80/],
  ['C04', 'B-500 สั่งขั้นต่ำกี่ใบ', /800/],
  ['C06', 'พิมพ์โลโก้ใบละเท่าไร ขั้นต่ำเท่าไร', /0\.80.*5,000/],
  ['C09', 'เมื่อไรจะได้เครดิต', /3.*30/],
  ['C10', 'ขอขวดตัวอย่างได้กี่ใบ', /ฟรี.*3.*เดือน/],
  ['C11', 'มีขวด 1 ลิตรไหม', /ไม่มี/],
  ['C12', 'ช่วยเขียนโค้ด Python ให้หน่อย', /ขออภัย.*ขวดแก้ว/],
]) test(`${id} context answer`, () => assert.match(ask(q), expected));
test('C05 discount uses PRICE roundtrip', () => {
  assert.deepEqual(tag('สั่ง B-250 ใส 10,000 ใบ ได้ส่วนลดกี่ %'), { model: 'B-250', color: 'clear', quantity: 10000 });
  assert.match(result('PRICE', price), /5%/);
});
test('C07 shipping roundtrip uses result trips and money', () => {
  assert.deepEqual(tag('25,000 ใบ ส่งไกล 160 กม. ค่าส่งเท่าไร'), { quantity: 25000, distanceKm: 160 });
  assert.match(result('PRICE', { ok: true, lines: { shipping: '3000.00', trips: 2 } }), /3,000\.00.*2 เที่ยว/);
});
test('C08 earliest pickup delegated to rules, including holidays', () => {
  tag('วันรับของเร็วสุดวันไหน');
  assert.match(result('PRICE', { ok: true, earliestPickup: '2026-10-25' }), /2026-10-25/);
  assert.match(result('PRICE', { ok: true, earliestPickup: '2030-02-09' }), /2030-02-09/);
});
test('C13 QUOTE roundtrip and login required', () => {
  assert.deepEqual(tag('ขอใบเสนอราคา B-250 ใส 10,000 ใบ พิมพ์โลโก้ ส่งโรงงานนครสวรรค์', 'QUOTE'), { model: 'B-250', color: 'clear', quantity: 10000, logo: true, addressCode: 'ADDR-01' });
  const a = result('QUOTE', { ok: true, quoteNo: 'QT-0001', validUntil: '2026-10-18', lines: { total: '63023.00' } });
  assert.match(a, /QT-0001.*2026-10-18.*63,023\.00/);
  assert.match(result('QUOTE', { ok: false, error: 'LOGIN_REQUIRED' }), /ล็อกอิน/);
});
test('C14 ORDER_STATUS roundtrip respects NOT_FOUND', () => {
  assert.deepEqual(tag('SO-0001 ถึงไหนแล้ว', 'ORDER_STATUS'), { orderNo: 'SO-0001' });
  assert.equal(result('ORDER', { ok: false, error: 'NOT_FOUND' }), 'ไม่พบออเดอร์นี้ค่ะ');
});
test('M01 all turns retain model, color and quantity', () => {
  const history = [];
  const turn = q => { const a = ask(q, {}, history); history.push(user(q), assistant(a)); return a; };
  assert.match(turn('B-250 มีสีอะไร'), /ใส.*ชา.*เขียว/);
  assert.match(turn('สีเขียวใบละเท่าไร'), /5\.80/);
  assert.match(turn('ขั้นต่ำเท่าไร'), /1,200/);
  const a = turn('ถ้าหมื่นใบค่าขวดเท่าไร');
  assert.deepEqual(JSON.parse(a.slice(7)), { model: 'B-250', color: 'green', quantity: 10000 });
  const money = result('PRICE', price, 'ถ้าหมื่นใบค่าขวดเท่าไร', history);
  assert.match(money, /58,000\.00.*2,900\.00/);
  history.push(assistant(money));
  assert.deepEqual(tag('ใส่โลโก้ด้วยเพิ่มเท่าไร', 'PRICE', history), { model: 'B-250', color: 'green', quantity: 10000, logo: true });
  assert.match(result('PRICE', price), /8,000\.00/);
});
test('M02 all turns quantity, earliest pickup, quote and expiry', () => {
  const history = [];
  let q = 'ราคา B-100 ใส 9,600 ใบ ส่งคลังบางนา';
  assert.deepEqual(tag(q), { model: 'B-100', color: 'clear', quantity: 9600, addressCode: 'ADDR-02' });
  let a = result('PRICE', { ok: true, lines: { bottles: '30720.00', vat: '2150.40', total: '32870.40' }, upsell: { quantity: 10000, savings: '320.00' } }, q);
  assert.match(a, /30,720\.00.*2,150\.40.*32,870\.40.*320\.00/);
  history.push(user(q), assistant(a));
  q = 'แล้วถ้าหมื่นใบล่ะ';
  assert.equal(tag(q, 'PRICE', history).quantity, 10000);
  a = result('PRICE', { ok: true, lines: { subtotal: '30400.00', total: '32528.00' } }, q, history);
  assert.match(a, /30,400\.00.*32,528\.00/);
  history.push(user(q), assistant(a));
  tag('รับของเร็วสุดวันไหน', 'PRICE', history);
  assert.match(result('PRICE', price), /2026-10-25/);
  assert.equal(tag('ขอใบเสนอราคาเลย', 'QUOTE', history).quantity, 10000);
  a = result('QUOTE', { ok: true, quoteNo: 'QT-0002', validUntil: '2026-10-18', lines: { total: '32528.00' } });
  history.push(user('ขอใบเสนอราคาเลย'), assistant(a));
  assert.match(ask('ใบนี้หมดอายุเมื่อไร', {}, history), /2026-10-18/);
});
test('M03 all address changes and distance boundary', () => {
  const history = [];
  for (const [q, code, shipping] of [
    ['B-500 ใส 25,000 ใบ ส่งนครสวรรค์ (160 กม.) ค่าส่งเท่าไร', 'ADDR-01', '3000.00'],
    ['ถ้าส่งลาดกระบังแทน', 'ADDR-03', '0.00'],
    ['ฉะเชิงเทราล่ะ', 'ADDR-04', '3000.00'],
  ]) {
    const input = tag(q, 'PRICE', history);
    assert.equal(input.addressCode, code); assert.equal(input.quantity, 25000);
    const a = result('PRICE', { ok: true, lines: { shipping, trips: 2 } }, q, history);
    assert.ok(a.includes(Number(shipping).toLocaleString('en-US', { minimumFractionDigits: 2 })));
    history.push(user(q), assistant(a));
  }
  assert.equal(tag('ถ้าไกลเกิน 300 กม.', 'PRICE', history).distanceKm, 301);
  assert.match(result('PRICE', { ok: false, errors: [{ code: 'DISTANCE_TOO_FAR' }] }), /02-000-0000.*@saisai-test/);
  assert.match(ask('เบอร์อะไร', {}, history), /02-000-0000/);
});
test('M04 all claim follow-ups from actual PDF pages', () => {
  const extra = { chunks: [page('SS-POLICY.pdf', 12), page('SS-POLICY.pdf', 13, 2)] };
  const history = [];
  for (const [q, patterns] of [
    ['เคลมได้ภายในกี่วัน', [/7 วัน/]],
    ['ต้องแนบรูปกี่รูป', [/1.*5|1–5/]],
    ['ไฟล์แบบไหน', [/JPG/, /PNG/, /5 MB/]],
    ['เลขล็อตเขียนยังไง', [/LOT-/, /6 หลัก/]],
  ]) { const a = ask(q, extra, history); for (const re of patterns) assert.match(a, re); history.push(user(q), assistant(a)); }
  tag('SO-0001 เคลมได้ไหม', 'ORDER_STATUS', history, extra);
  assert.match(result('ORDER', { ok: true, order: { no: 'SO-0001', step: 6, shippedAt: '2026-06-12T09:00:00+07:00' } }, 'SO-0001 เคลมได้ไหม', history, extra), /ไม่ได้.*7 วัน/);
});
test('M05 all credit, due date, transfer and prepay turns', () => {
  const extra = { chunks: [page('SS-POLICY.pdf', 7), page('SS-FAQ-EN.pdf', 9, 2)] };
  const history = [];
  for (const [q, re] of [
    ['ได้เครดิตเมื่อไร', /3.*30/], ['ครบกำหนดนับยังไง', /30/], ['ถ้าส่ง 1 พ.ย. ครบกำหนดวันไหน', /2026-12-01/],
    ['โอนเข้าบัญชีอะไร', /ธนาคารทดสอบ.*000-0-00000-0/], ['ยังไม่โอนเริ่มผลิตได้ไหม', /รับเงิน|pay.*before|ก่อน.*ผลิต/i],
  ]) { const a = ask(q, extra, history); assert.match(a, re); history.push(user(q), assistant(a)); }
});
test('M06 all English turns', () => {
  const history = [];
  for (const [q, re] of [['What sizes?', /100\/150\/250\/500 ml/], ['Price of B-150 amber?', /4\.10/], ['Minimum?', /1,800/], ['Free samples?', /3.*per model.*per company.*per month/]]) {
    const a = ask(q, { lang: 'en' }, history); assert.match(a, re); assert.doesNotMatch(a, /ค่ะ/); history.push(user(q), assistant(a));
  }
  tag('Earliest pickup?', 'PRICE', history, { lang: 'en' });
  assert.match(result('PRICE', price, 'Earliest pickup?', history), /2026-10-25/);
});
for (const [id, q, chunks, expected] of [
  ['R01', 'ขวดแตกต้องแจ้งเคลมภายในกี่วัน ใช้รูปกี่รูป', [page('SS-POLICY.pdf', 12), page('SS-POLICY.pdf', 13, 2)], [/7 วัน/, /1.*5|1–5/]],
  ['R02', 'รถหนึ่งเที่ยวขนขวดได้กี่ใบ', [page('SS-LOGISTICS.pdf', 7)], [/20,000/]],
  ['R03', 'ขวดสีเขียวมีรุ่นไหนบ้าง', [pages.find(p => p.filename === 'SS-CAT-BOTTLES.pdf' && /สีเขียว.*B-250|B-250.*สีเขียว/.test(p.text))].map(p => ({ ...p, n: 1 })), [/B-250/]],
  ['R04', 'อนุมัติแบบโลโก้ตอนไหน', [page('SS-LOGO-PRINT.pdf', 11)], [/ยืนยันสเปก/]],
  ['R05', 'B-500 กล่องละกี่ใบ', [page('SS-LOGISTICS.pdf', 4)], [/24/]],
  ['R06', 'B-500 สีชาใบละเท่าไร แล้วเคลมได้ภายในกี่วัน', [page('SS-POLICY.pdf', 12)], [/8\.40/, /7 วัน/]],
  ['R08', 'What is the lead time?', [page('SS-FAQ-EN.pdf', 8)], [/14 days/]],
]) test(`${id} answer from real PyMuPDF text with citation`, () => {
  const a = ask(q, { chunks });
  for (const re of expected) assert.match(a, re);
  assert.match(a, /\[\d+\]/);
});
test('R07 uploaded chunk is the sole promotion source', () => {
  // Upload content is supplied by the caller, just as newly ingested PDF text would be.
  const extra = { chunks: [{ n: 3, filename: 'SS-PROMO-NOV.pdf', page: 1, text: 'เดือนพฤศจิกายนมีโปรโมชั่น ออกแบบโลโก้ฟรี สำหรับลูกค้าที่ร่วมรายการ' }] };
  assert.match(ask('เดือนพฤศจิกายนมีโปรอะไร', extra), /ออกแบบโลโก้ฟรี.*\[3\]/);
  assert.equal(ask('เดือนพฤศจิกายนมีโปรอะไร'), 'ไม่พบข้อมูลในเอกสารค่ะ');
});
test('No relevant chunk, unsupported product and injected facts', () => {
  assert.equal(ask('ข้อมูลดาวอังคาร', { chunks: [page('SS-LOGISTICS.pdf', 4)] }), 'ไม่พบข้อมูลในเอกสารค่ะ');
  assert.match(ask('B-999 ราคาเท่าไร'), /ไม่มี/);
  assert.equal(ask('ขวด 250 มล. สีเขียวใบละเท่าไร', { products: ctx.products.map(p => ({ ...p, price: '99.37' })) }).includes('99.37'), true);
});
test('Thai numbers, digits and no default invented product/quantity', () => {
  for (const [s, n] of [['หมื่น', 10000], ['สองหมื่นห้าพัน', 25000], ['สองร้อยห้าสิบ', 250], ['ห้าร้อย', 500], ['ยี่สิบเอ็ด', 21]]) assert.equal(thaiNumber(s), n);
  assert.deepEqual(tag('สั่งหมื่นใบ ขวดสองร้อยห้าสิบมิล'), { model: 'B-250', quantity: 10000 });
  assert.equal(tag('สั่งสองหมื่นห้าพันใบ ขวดห้าร้อยมิล').quantity, 25000);
  assert.equal(tag('สั่ง B-250 ๑๐,๐๐๐ ใบ').quantity, 10000);
  assert.deepEqual(tag('ค่าส่งเท่าไร'), {});
});
test('T02 explanatory claim answer has at least three sentences', () => {
  const a = ask('อธิบายขั้นตอนเคลม', { chunks: [page('SS-POLICY.pdf', 12), page('SS-POLICY.pdf', 13, 2)] });
  assert.ok(a.split(/\.\s+/).length >= 3, a);
});
let server, base;
test.before(async () => {
  server = createServer({ latencyMs: 0, streamDelayMs: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
test('HTTP health, models, non-stream and OpenAI SSE', async () => {
  assert.deepEqual((await (await fetch(base + '/health')).json()).models, { llm: 'mock', stt: 'mock', tts: 'mock', rerank: 'mock' });
  assert.equal((await (await fetch(base + '/v1/models')).json()).data[0].id, 'mock');
  const payload = { model: 'mock', messages: messages('สั่งหมื่นใบ ขวดสองร้อยห้าสิบมิล') };
  const plain = await (await post('/v1/chat/completions', payload)).json();
  const response = await post('/v1/chat/completions', { ...payload, stream: true });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const events = (await response.text()).trim().split('\n\n').map(e => e.slice(6));
  assert.equal(events.pop(), '[DONE]');
  const frames = events.map(JSON.parse);
  assert.equal(frames.at(-1).choices[0].finish_reason, 'stop');
  assert.equal(frames.map(f => f.choices[0].delta.content || '').join(''), plain.choices[0].message.content);
  assert.equal(JSON.parse(plain.choices[0].message.content.slice(7)).quantity, 10000);
});
test('HTTP rerank preserves every original index and scores descend', async () => {
  const data = await (await post('/v1/rerank', { query: 'q', documents: ['z', 'a', { text: 'b' }] })).json();
  assert.deepEqual(data.results.map(r => r.index), [0, 1, 2]);
  assert.ok(data.results[0].relevance_score > data.results[1].relevance_score);
  assert.deepEqual(data.results.map(r => r.document), ['z', 'a', { text: 'b' }]);
});
const questions = JSON.parse(await readFile(new URL('../../e2e/voice-fixtures/questions.json', import.meta.url)));
async function upload(bytes, name = 'voice.wav') {
  const form = new FormData(); form.append('file', new Blob([bytes]), name);
  return (await fetch(base + '/v1/audio/transcriptions', { method: 'POST', body: form })).json();
}
for (const fixture of questions) {
  test(`${fixture.id} STT exact hash and WebM/Opus roundtrip`, async () => {
    const wav = await readFile(new URL(`../../e2e/voice-fixtures/${fixture.file}`, import.meta.url));
    const exact = await upload(wav);
    assert.equal(exact.text, fixture.text); assert.equal(exact.language, fixture.language); assert.ok(exact.duration > 1);
    const webm = await processBytes(ffmpeg, ['-v', 'error', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '64k', '-f', 'webm', 'pipe:1'], wav);
    const converted = await upload(webm, 'voice.webm');
    assert.equal(converted.text, fixture.text); assert.equal(converted.language, fixture.language);
  });
}
test('Unknown, silent, corrupt and unrelated audio returns empty', async () => {
  const silent = toneWav('silence'); silent.fill(0, 44);
  for (const bytes of [silent, Buffer.from('invalid audio'), toneWav('unrelated audio waveform')]) assert.equal((await upload(bytes)).text, '');
});
test('HTTP TTS RIFF, duration, deterministic response and memory fallback', async () => {
  for (const language of ['th', 'en']) {
    const payload = { input: language === 'th' ? 'น้องใสยินดีให้บริการค่ะ' : 'Hello, welcome to SaiSai glassware.', voice: 'nongsai', language };
    const response = await post('/v1/audio/speech', payload);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    const wav = Buffer.from(await response.arrayBuffer());
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    const pcm = await processBytes(ffmpeg, ['-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], wav);
    assert.ok(pcm.length / 32000 > 1);
    assert.equal(digest(wav), digest(Buffer.from(await (await post('/v1/audio/speech', payload)).arrayBuffer())));
  }
});
test('Latency applies to every endpoint including health', async () => {
  const slow = createServer({ latencyMs: 45 });
  await new Promise(resolve => slow.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${slow.address().port}`;
    for (const [path, payload] of [['/health'], ['/v1/models'], ['/v1/rerank', { documents: [] }], ['/v1/chat/completions', { messages: messages('สวัสดี') }], ['/v1/audio/speech', { input: 'hello world', language: 'en' }], ['/v1/audio/transcriptions', new FormData()]]) {
      const start = performance.now();
      const options = payload instanceof FormData ? { method: 'POST', body: payload } : payload ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) } : {};
      const response = await fetch(url + path, options);
      await response.arrayBuffer();
      assert.ok(performance.now() - start >= 40, path);
    }
  }
  finally { slow.closeAllConnections(); await new Promise(resolve => slow.close(resolve)); }
});
test('Malformed input errors are JSON without crashing the server', async () => {
  assert.equal((await post('/v1/chat/completions', { messages: [] })).status, 400);
  assert.equal((await post('/v1/rerank', {})).status, 400);
  assert.equal((await post('/v1/audio/speech', { input: '' })).status, 400);
  assert.equal((await fetch(base + '/missing')).status, 404);
});
test('V01–V10 transcribed text also drives the LLM contract', () => {
  const history = [];
  assert.match(ask(questions[0].text), /5\.80/);
  history.push(user(questions[0].text), assistant(ask(questions[0].text)));
  assert.deepEqual(tag(questions[1].text, 'PRICE', history), { model: 'B-250', color: 'green', quantity: 10000 });
  history.push(user(questions[1].text), assistant(result('PRICE', price)));
  const logo = tag(questions[2].text, 'PRICE', history); assert.equal(logo.logo, true); assert.equal(logo.quantity, 10000);
  history.push(user(questions[2].text), assistant(result('PRICE', price)));
  assert.equal(tag(questions[3].text, 'PRICE', history).addressCode, 'ADDR-01');
  tag(questions[4].text, 'QUOTE', history, { loggedIn: false, company: null });
  assert.match(ask(questions[5].text, { chunks: [page('SS-POLICY.pdf', 12)] }), /7 วัน/);
  assert.match(ask(questions[6].text), /800/);
  assert.match(ask(questions[7].text), /1,800/);
  tag(questions[8].text);
  assert.match(ask(questions[9].text), /3.*per model.*per company.*per month/);
});
test('Rule-native result fields, logo boolean, upsell and pickup aliases', () => {
  const a = result('PRICE', { ok: true, lines: { logo: true, logoAmount: '8000.00', discountRate: '0.05' }, earliestPickupDate: '2026-10-25', upsell: { targetQty: 10000, ratePercent: 5, saving: '320.00' } });
  assert.match(a, /8,000\.00/); assert.match(a, /2026-10-25/); assert.match(a, /10,000.*5%.*320\.00/);
  assert.doesNotMatch(a, /NaN|undefined/);
});
