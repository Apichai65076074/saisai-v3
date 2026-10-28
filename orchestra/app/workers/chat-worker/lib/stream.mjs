/** Incremental scanner buffers incomplete tags/think/citations; never exposes their JSON. */
export class CleanStream {
  constructor(onText, onCite = () => {}) { this.pending = ''; this.thinking = false; this.onText = onText; this.onCite = onCite; this.tools = []; }
  push(text, final = false) {
    this.pending += text;
    while (this.pending) {
      if (this.thinking) {
        const end = this.pending.indexOf('</think>');
        if (end < 0) { this.pending = this.pending.slice(-7); return; }
        this.pending = this.pending.slice(end + 8); this.thinking = false; continue;
      }
      if (this.pending.startsWith('<think>')) { this.pending = this.pending.slice(7); this.thinking = true; continue; }
      const tool = this.pending.match(/^\[(PRICE|QUOTE|ORDER_STATUS)\]\s*/);
      if (tool) {
        const start = tool[0].length;
        let depth = 0, quoted = false, escape = false, end = -1;
        for (let i = start; i < this.pending.length; i++) {
          const c = this.pending[i];
          if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
          else if (c === '"') quoted = true;
          else if (c === '{') depth++;
          else if (c === '}' && --depth === 0) { end = i + 1; break; }
        }
        if (end < 0) { if (final) this.pending = ''; return; }
        try { this.tools.push({ type: tool[1], input: JSON.parse(this.pending.slice(start, end)) }); } catch { /* discard malformed tool JSON */ }
        this.pending = this.pending.slice(end); continue;
      }
      const cite = this.pending.match(/^\[(\d+)\]/);
      if (cite) { this.onCite(Number(cite[1])); this.pending = this.pending.slice(cite[0].length); continue; }
      if (this.pending[0] === '[' || this.pending[0] === '<') {
        const tokens = ['<think>', '[PRICE]', '[QUOTE]', '[ORDER_STATUS]'];
        if (tokens.some(t => t.startsWith(this.pending)) || /^\[\d*$/.test(this.pending)) { if (final) this.pending = ''; return; }
      }
      const next = this.pending.slice(1).search(/[<\[]/);
      const size = next < 0 ? this.pending.length : next + 1;
      this.onText(this.pending.slice(0, size)); this.pending = this.pending.slice(size);
    }
  }
  end() { this.push('', true); }
}
export function strip(text) { let out = ''; const s = new CleanStream(t => { out += t; }); s.push(text); s.end(); return out; }
/** Thai polite endings/newlines/punctuation, decimal-safe; hard limit 200 UTF-16 chars. */
export class Sentences {
  constructor(emit) { this.buffer = ''; this.emit = emit; }
  push(text, final = false) {
    this.buffer += text;
    while (this.buffer) {
      const re = /ค่ะ|ครับ|ฯ|\n|[!?]|\.(?!\d)/g;
      const m = re.exec(this.buffer);
      let end = m ? m.index + m[0].length : 0;
      // A trailing period might be the first half of a streamed decimal.
      if (m?.[0] === '.' && end === this.buffer.length && !final) end = 0;
      if (!end && this.buffer.length < 200 && !final) break;
      end = Math.min(end || (final ? this.buffer.length : 200), 200);
      if (end === 200 && /[\uD800-\uDBFF]/.test(this.buffer[end - 1])) end--;
      const sentence = this.buffer.slice(0, end).trim(); this.buffer = this.buffer.slice(end);
      if (sentence) this.emit(sentence);
    }
  }
  end() { this.push('', true); }
}
