import { checkAdvance, STATUS_PRODUCTION, creditStatus } from '../../../web/lib/rules.ts';
import { priceFromInput } from '../../../web/lib/server/pricing.ts';
import { createQuote } from '../../../web/lib/server/quotes.ts';
import { getOrderForCompany } from '../../../web/lib/server/orders.ts';
import { retrieve } from './retrieve.mjs';
import { loadContext, systemPrompt } from './context.mjs';
import { CleanStream, Sentences, strip } from './stream.mjs';

export async function* completion(messages, signal, fetchImpl = fetch) {
  const response = await fetchImpl(`${(process.env.LLM_BASE_URL || 'http://mock-llm:8000/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY || 'mock'}` },
    body: JSON.stringify({ model: process.env.LLM_MODEL || 'mock', messages, stream: true, temperature: 0.2 }),
  });
  if (!response.ok || !response.body) throw new Error('LLM unavailable');
  let buffer = ''; const decoder = new TextDecoder(); let finished = false;
  for await (const bytes of response.body) {
    buffer += decoder.decode(bytes, { stream: true });
    let pos;
    while ((pos = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, pos).trim(); buffer = buffer.slice(pos + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { finished = true; break; }
      const frame = JSON.parse(data);
      if (frame.error) throw new Error('LLM stream error');
      if (frame.choices?.[0]?.finish_reason) finished = true;
      const delta = frame.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') yield delta;
    }
    if (finished) break;
  }
  if (!finished) throw new Error('LLM interrupted');
}

export async function executeTool(db, tool, request, now, loggedIn, publish) {
  if (tool.type === 'PRICE') {
    // General shipping/earliest-date questions need a valid quote input. Defaults come from SQL,
    // while explicit invalid models/colors/quantities are left to quote() validation.
    const fallback = (await db.query(`SELECT p.model_code AS model,p.color,m.min_qty AS quantity FROM products p JOIN product_models m ON m.code=p.model_code WHERE ($1::text IS NULL OR p.model_code=$1) ORDER BY p.code LIMIT 1`, [tool.input.model ?? null])).rows[0];
    return priceFromInput(db, { ...fallback, distanceKm: 0, ...tool.input }, { now, companyId: loggedIn ? request.companyId : null });
  }
  if (tool.type === 'ORDER_STATUS') {
    if (!loggedIn) return { ok: false, error: 'NOT_FOUND' };
    const order = await getOrderForCompany(db, String(tool.input.orderNo ?? ''), request.companyId, now);
    return order ? { ok: true, order } : { ok: false, error: 'NOT_FOUND' };
  }
  if (!loggedIn) return { ok: false, error: 'LOGIN_REQUIRED' };
  try { return await createQuote(db, { companyId: request.companyId, userId: request.userId, input: tool.input, now, publish }); }
  catch (error) { if (error.errors) return { ok: false, errors: error.errors }; throw error; }
}

export const TTS_MAX_CHARS = 600;

export async function handleChat(db, request, { emit, tts, publish, retrieveImpl = retrieve, completionImpl = completion }) {
  const lang = /[ก-๙]/.test(request.text) ? 'th' : /[a-z]/i.test(request.text) ? 'en' : request.lang === 'en' ? 'en' : 'th';
  const deadline = AbortSignal.timeout(85000);
  let retrieved = [], products = [], quoteNo;
  const cites = []; let text = '', seq = 0;
  const reply = payload => emit({ messageId: request.messageId, lang, cites: [...cites], ...payload });
  // Spoken answer total <= TTS_MAX_CHARS (PROBLEM TTS: sentence <= 200, answer <= 600); the text reply is untouched.
  let spoken = 0;
  const sentences = new Sentences(sentence => {
    if (request.tts && spoken + sentence.length > TTS_MAX_CHARS) return;
    spoken += sentence.length; seq++;
    reply({ type: 'sentence', seq, text: sentence });
    if (request.tts) tts({ messageId: request.messageId, seq, text: sentence, lang });
  });
  const output = part => { text += part; reply({ type: 'delta', text: part }); sentences.push(part); };
  reply({ type: 'status', text: lang === 'en' ? 'Thinking…' : 'กำลังคิด…' });
  try {
    // Re-delivery after saving but before ack must not create a second quotation.
    const previous = (await db.query(`SELECT text,cites,meta FROM chat_messages WHERE session_id=$1 AND role='assistant' AND meta->>'messageId'=$2 LIMIT 1`, [request.sessionId, request.messageId])).rows[0];
    if (previous) {
      cites.push(...previous.cites); output(previous.text); sentences.end();
      reply({ type: 'done', text: previous.text, ...previous.meta, cites }); return;
    }
    const { ctx, now, history } = await loadContext(db, { ...request, lang }, []);
    // Resolve short follow-up questions before retrieval as well as before generation.
    const followup = /แบบไหน|กี่รูป|อันนั้น|สีนั้น|สีนี้|นับยังไง|^minimum|^what about/i.test(request.text);
    const searchText = followup ? [...history.filter(m => m.role === 'user').slice(-2).map(m => strip(m.text)), request.text].join(' ').slice(-600) : request.text;
    const chunks = await retrieveImpl(db, searchText, { signal: deadline });
    deadline.throwIfAborted();
    retrieved = chunks.map(({ filename, page, score }) => ({ filename, page, score }));
    ctx.chunks = chunks.map((c, i) => ({ n: i + 1, filename: c.filename, page: c.page, text: c.content }));
    deadline.throwIfAborted();
    products = ctx.products.map(p => p.code);
    const messages = [{ role: 'system', content: systemPrompt(ctx) }, ...history.map(m => ({ role: m.role, content: strip(m.text) })), { role: 'user', content: request.text }];
    // Reject unauthorized order numbers before generating prose, even if the model ignores tool instructions.
    const orderNumbers = [...new Set(request.text.match(/\bSO-\d+\b/gi) ?? [])];
    let denied = false;
    for (const no of orderNumbers) {
      const found = ctx.loggedIn && (await db.query('SELECT 1 FROM orders WHERE order_no=$1 AND company_id=$2', [no.toUpperCase(), request.companyId])).rowCount > 0;
      if (!found) { denied = true; break; }
    }
    const unpaidProduction = /ยังไม่โอน|ยังไม่ชำระ|before.*pay|without.*pay/i.test(request.text) && /เริ่มผลิต|production/i.test(request.text)
      && checkAdvance(STATUS_PRODUCTION - 1, STATUS_PRODUCTION, ctx.company?.credit.terms ?? creditStatus(0).terms, false).error?.code === 'PAYMENT_REQUIRED';
    if (denied) output(lang === 'en' ? 'Order not found.' : 'ไม่พบออเดอร์นี้ค่ะ');
    else if (unpaidProduction) output(lang === 'en' ? 'Production cannot start until staff record payment.' : 'ยังเริ่มผลิตไม่ได้ ต้องให้พนักงานบันทึกรับเงินก่อนค่ะ');
    else {
      let calls = 0;
      for (;;) {
        let raw = '';
        const clean = new CleanStream(output, n => {
          const c = chunks[n - 1];
          if (c && !cites.some(x => x.filename === c.filename && x.page === c.page)) cites.push({ filename: c.filename, page: c.page });
        });
        for await (const token of completionImpl(messages, AbortSignal.any([deadline, AbortSignal.timeout(60000)]))) { raw += token; clean.push(token); }
        clean.end();
        if (!clean.tools.length) break;
        if (calls >= 2) throw new Error('Tool round limit');
        messages.push({ role: 'assistant', content: raw });
        // At most two actions in total; ignore further commands to prevent unintended writes.
        for (const tool of clean.tools) {
          if (calls >= 2) throw new Error('Tool action limit');
          calls++;
          const result = await executeTool(db, tool, request, now, ctx.loggedIn, publish);
          if (result.quoteNo) quoteNo = result.quoteNo;
          messages.push({ role: 'user', content: `${tool.type === 'ORDER_STATUS' ? 'ORDER' : tool.type}_RESULT: ${JSON.stringify(result)}` });
        }
      }
    }
    if (!text.trim()) throw new Error('LLM empty response');
    sentences.end();
    const meta = { messageId: request.messageId, companyId: request.companyId ?? null, retrieved, products, lang, ...(quoteNo ? { quoteNo } : {}) };
    await db.query(`INSERT INTO chat_messages(session_id,role,text,cites,via,meta) VALUES($1,'assistant',$2,$3,$4,$5)`, [request.sessionId, text, JSON.stringify(cites), request.via || 'text', JSON.stringify(meta)]);
    reply({ type: 'done', text, retrieved, products, ...(quoteNo ? { quoteNo } : {}) });
  } catch (error) {
    // Model/HTTP failures are user-visible errors, not consumer crashes. DB/MQ failures may retry safely.
    if (/LLM|abort|timeout|Tool /i.test(error.message) || error.name === 'TimeoutError' || error instanceof TypeError || error instanceof SyntaxError) {
      reply({ type: 'error', text: lang === 'en' ? 'Sorry, please try again.' : 'ขออภัยค่ะ ระบบตอบช้า ลองใหม่อีกครั้งนะคะ', retrieved, products });
    } else throw error;
  }
}
