import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { answer } from './lib/llm.mjs';
import { speech, transcribe } from './lib/audio.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) { const error = new Error('Request too large'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function createServer({ latencyMs = Number(process.env.MOCK_LATENCY_MS ?? 800), streamDelayMs = 12 } = {}) {
  streamDelayMs = Number(process.env.MOCK_STREAM_DELAY_MS ?? streamDelayMs);
  return http.createServer(async (req, res) => {
    try {
      await sleep(Math.max(0, Number.isFinite(latencyMs) ? latencyMs : 800));
      const url = new URL(req.url, 'http://mock.local');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', models: { llm: 'mock', stt: 'mock', tts: 'mock', rerank: 'mock' } });
      if (req.method === 'GET' && url.pathname === '/v1/models') return send(res, 200, { object: 'list', data: [{ id: 'mock', object: 'model', created: 0, owned_by: 'saisai' }] });
      if (req.method !== 'POST') return send(res, 404, { error: { message: 'Not found' } });
      const bytes = await body(req);
      if (url.pathname === '/v1/audio/transcriptions') {
        const form = await new Request('http://mock.local', { method: 'POST', headers: { 'content-type': req.headers['content-type'] || '' }, body: bytes }).formData();
        const file = form.get('file');
        if (!file || typeof file.arrayBuffer !== 'function') return send(res, 400, { error: { message: 'Multipart file is required' } });
        if (file.size > 2 * 1024 * 1024) return send(res, 413, { error: { message: 'Audio exceeds 2 MB' } });
        return send(res, 200, await transcribe(Buffer.from(await file.arrayBuffer())));
      }
      const data = JSON.parse(bytes.toString('utf8') || '{}');
      if (url.pathname === '/v1/rerank') {
        if (!Array.isArray(data.documents)) return send(res, 400, { error: { message: 'documents must be an array' } });
        return send(res, 200, { results: data.documents.map((document, index) => ({ index, relevance_score: 1 / (index + 1), document })) });
      }
      if (url.pathname === '/v1/audio/speech') {
        if (typeof data.input !== 'string' || !data.input.trim() || data.input.length > 10000) return send(res, 400, { error: { message: 'input must contain 1–10000 characters' } });
        const lang = data.language || (/[ก-๙]/.test(data.input) ? 'th' : 'en');
        const wav = await speech(data.input, lang);
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length });
        return res.end(wav);
      }
      if (url.pathname === '/v1/chat/completions') {
        if (!Array.isArray(data.messages) || !data.messages.length || data.messages.some(m => !m || typeof m.content !== 'string')) return send(res, 400, { error: { message: 'messages must contain string content' } });
        const content = answer(data.messages);
        const base = { id: 'chatcmpl-mock', created: 0, model: data.model || 'mock' };
        if (!data.stream) return send(res, 200, { ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
        const emit = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
        emit({ role: 'assistant' });
        const chars = Array.from(content);
        const pacedSpeech = /three sentences/i.test([...data.messages].reverse().find(m => m.role === 'user')?.content || '');
        for (let at = 0; at < chars.length && !res.destroyed; at += 24) {
          emit({ content: chars.slice(at, at + 24).join('') });
          if (streamDelayMs) await sleep(streamDelayMs);
          if (pacedSpeech && streamDelayMs < 300) await sleep(300 - streamDelayMs); // cold TTS can overlap this explicit speech fixture
        }
        if (!res.destroyed) { emit({}, 'stop'); res.end('data: [DONE]\n\n'); }
        return;
      }
      return send(res, 404, { error: { message: 'Not found' } });
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 400, { error: { message: error.status === 413 ? error.message : 'Invalid request' } });
      else res.end();
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8000);
  const server = createServer();
  server.listen(port, '0.0.0.0', () => console.log(`[mock-llm] listening on :${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
