// Deterministic protocol mock: no prices, PDF facts, or money formulas live here.
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = (n) => Number(n).toLocaleString('en-US');
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
export function contextOf(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  return json(system.match(/(?:^|\n)CTX_JSON:\s*([^\n]*)/u)?.[1]) || {};
}
export function thaiNumber(text) {
  if (/^[\d,]+$/.test(text)) return Number(text.replaceAll(',', ''));
  const digits = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
  const units = { สิบ: 10, ร้อย: 100, พัน: 1000, หมื่น: 10000, แสน: 100000, ล้าน: 1000000 };
  const tokens = text.match(/ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน/g) || [];
  let total = 0, digit = 0;
  for (const token of tokens) {
    if (token in digits) digit = digits[token];
    else { total += (digit || 1) * units[token]; digit = 0; }
  }
  return total + digit;
}
const numberPattern = '(?:[0-9][0-9,]*|(?:(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน))+)';
function normalize(s) { return s.replace(/[๐-๙]/g, d => String(d.charCodeAt(0) - 0x0e50)).replace(/บี\s*/g, 'B-'); }
function explicitModel(text, ctx) {
  const direct = text.match(/\bB\s*-?\s*(\d+)/i);
  if (direct) return `B-${direct[1]}`;
  const size = text.match(new RegExp(`(${numberPattern})\\s*(?:มิลลิลิตร|มิล|มล\\.?|ml)`, 'i'));
  if (size) return ctx.products?.find(p => Number(p.sizeMl) === thaiNumber(size[1]))?.model || `B-${thaiNumber(size[1])}`;
}
function patchInput(input, raw, ctx) {
  const s = normalize(raw);
  const model = explicitModel(s, ctx);
  if (model) input.model = model;
  const color = /เขียว|green/i.test(s) ? 'green' : /สีชา|amber|\bชา\b/i.test(s) ? 'amber' : /สีใส|\bใส\b|clear|(?:B-\d+|มิล|มล\.?)[\s]*ใส/i.test(s) ? 'clear' : null;
  if (color) input.color = color;
  const qty = s.match(new RegExp(`(${numberPattern})\\s*(?:ใบ|ขวด|bottles?|units?)`, 'i'));
  if (qty) input.quantity = thaiNumber(qty[1]);
  if (/ไม่(?:เอา|พิมพ์|ใส่)?โลโก้|no logo|without logo/i.test(s)) input.logo = false;
  else if (/พิมพ์โลโก้|ใส่โลโก้|โลโก้ด้วย|with (?:a )?logo|print.*logo/i.test(s)) input.logo = true;
  const distance = s.match(new RegExp(`(${numberPattern})\\s*(?:กม\\.?|กิโลเมตร|km)`, 'i'));
  if (distance) {
    input.distanceKm = thaiNumber(distance[1]) + (/เกิน|more than|over/i.test(s) ? 1 : 0);
    delete input.addressCode;
  }
  const address = ctx.company?.addresses?.find(a => {
    if (s.toLowerCase().includes(a.code.toLowerCase())) return true;
    const label = (a.label || '').replace(/\([^)]*\)/g, '');
    return [...segmenter.segment(label)].some(t => t.isWordLike && t.segment.length >= 4 && s.includes(t.segment));
  });
  if (address) { input.addressCode = address.code; delete input.distanceKm; }
  if (/รับเอง|pick.?up at (?:the )?factory/i.test(s)) { input.distanceKm = 0; delete input.addressCode; }
  const date = s.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (date && /รับ|pickup|pick up/i.test(s)) input.pickupDate = date[0];
  return input;
}
export function inputOf(messages, ctx) {
  const input = {};
  for (const m of messages) {
    const text = String(m.content || '');
    if (m.role === 'system' || /^(PRICE|QUOTE|ORDER)_RESULT:/.test(text)) continue;
    const tag = text.match(/\[(?:PRICE|QUOTE)\](\{[^\n]*\})/);
    if (tag) Object.assign(input, json(tag[1]) || {});
    if (m.role === 'user') patchInput(input, text, ctx);
    else {
      const inferred = patchInput({}, text, ctx);
      for (const key of ['model', 'color']) if (input[key] === undefined && inferred[key] !== undefined) input[key] = inferred[key];
    }
  }
  return input;
}
const stopWords = new Set(['ขวด', 'ใบ', 'ค่ะ', 'ครับ', 'ได้', 'ไหม', 'อะไร', 'เท่าไร', 'กี่', 'ต้อง', 'เป็น', 'มี', 'ของ', 'การ', 'ที่', 'ให้', 'the', 'is', 'a', 'what', 'how', 'can', 'i', 'for', 'bottle', 'bottles']);
function terms(s) {
  return [...segmenter.segment(s.toLowerCase())].filter(t => t.isWordLike && !stopWords.has(t.segment)).map(t => t.segment);
}
const topics = [
  [/เคลม|claim|ขวดแตก|แนบรูป|ไฟล์แบบ|เลขล็อต|lot number/i, ['เคลม', 'claim', 'รูป', 'photo', 'LOT-', 'JPG', 'PNG']],
  [/ขั้นตอน|อธิบาย|explain|procedure/i, ['ขั้นตอน', 'เคลม', 'claim', 'รับเรื่อง', 'reviewing']],
  [/กล่อง|carton/i, ['กล่อง', 'carton']],
  [/เที่ยว|truck|trip/i, ['เที่ยว', 'truck', 'capacity']],
  [/สีเขียว|green/i, ['เขียว', 'green']],
  [/อนุมัติ.*โลโก้|แบบโลโก้|logo.*approv/i, ['ยืนยันสเปก', 'อนุมัติ', 'artwork', 'approved']],
  [/lead time/i, ['lead time', 'days']],
  [/พฤศจิกายน|โปร|promotion/i, ['พฤศจิกายน', 'โปร', 'ฟรี', 'promotion']],
  [/ครบกำหนด|due date/i, ['ครบกำหนด', 'วันจัดส่ง', 'due', 'shipping']],
  [/เริ่มผลิต|ก่อน.*โอน|production/i, ['เริ่มผลิต', 'รับเงิน', 'payment', 'production']],
];
export function documentAnswer(question, ctx, english = false) {
  const chunks = ctx.chunks || [];
  const qterms = terms(question);
  const hints = topics.filter(([re]) => re.test(question)).flatMap(([, words]) => words);
  const model = explicitModel(question, ctx);
  const focus = /ไฟล์|file type/i.test(question) ? ['JPG', 'PNG', 'MB', 'ไฟล์'] : /ล็อต|lot number/i.test(question) ? ['LOT-', 'เลขล็อต'] : /รูป|photo/i.test(question) ? ['รูป', 'photo', 'ภายใน', 'นับจากวันจัดส่ง'] : [];
  const scored = chunks.map((c, i) => {
    const text = String(c.text || c.content || '');
    const low = text.toLowerCase();
    const score = qterms.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0) + hints.reduce((n, t) => n + (low.includes(t.toLowerCase()) ? 2 : 0), 0) + focus.reduce((n, t) => n + (low.includes(t.toLowerCase()) ? 8 : 0), 0);
    return { ...c, text, n: c.n ?? i + 1, score };
  }).filter(c => c.score >= 2).sort((a, b) => b.score - a.score);
  if (!scored.length) return english ? 'I could not find this information in the documents.' : 'ไม่พบข้อมูลในเอกสารค่ะ';
  const selected = scored.slice(0, 2);
  let remaining = 560;
  return selected.map(c => {
    const clean = c.text.split('\n').filter(line => !/^(?:SS-[A-Z-]+\.pdf|บจก\.|ข้อมูลทดสอบ|SaiSai Glassware)/.test(line.trim())).join('\n');
    const bullets = clean.split(/\n?\s*•\s*|(?<=[.!?])\s+(?=[A-Z])/).map(t => t.split(/\n(?=\d+\.\d*\s)/)[0].trim()).filter(Boolean);
    const lines = bullets.map((line, i) => ({ line, i, score: qterms.filter(t => line.toLowerCase().includes(t)).length + hints.filter(t => line.toLowerCase().includes(t.toLowerCase())).length * 2 + focus.filter(t => line.toLowerCase().includes(t.toLowerCase())).length * 7 + (model && line.includes(model) ? 2 : 0) }))
      .filter(l => l.score > 0).sort((a, b) => b.score - a.score).slice(0, /อธิบาย|ขั้นตอน|explain/i.test(question) ? 5 : 3);
    // Preserve table headers and values together; never infer table cells.
    const chosen = [];
    for (const { line } of lines) {
      const compact = line.replace(/\s+/g, ' ');
      if (compact.length <= remaining) { chosen.push(compact); remaining -= compact.length + 2; }
    }
    if (!chosen.length && remaining > 80) { chosen.push(clean.replace(/\s+/g, ' ').slice(0, remaining - 8)); remaining = 0; }
    return chosen.length ? `${chosen.join('. ')} [${c.n}]` : '';
  }).filter(Boolean).join('. ') + (english ? '' : ' ค่ะ');
}
function resultAnswer(kind, data, ctx, en, original) {
  const polite = en ? '' : 'ค่ะ';
  if (data.error === 'LOGIN_REQUIRED') return en ? 'Please log in before requesting a quotation.' : 'กรุณาล็อกอินก่อนขอใบเสนอราคาค่ะ';
  if (data.error === 'NOT_FOUND' || (kind === 'ORDER' && data.ok === false)) return en ? 'Order not found.' : 'ไม่พบออเดอร์นี้ค่ะ';
  if (kind === 'ORDER') {
    const order = data.order || data;
    if (/เคลม|claim/i.test(original)) {
      const shipped = order.shippedAt || order.shipped_at || order.deliveredAt;
      if (shipped && ctx.today && ctx.rules?.claimDays != null) {
        const days = (Date.parse(ctx.today.slice(0, 10)) - Date.parse(shipped.slice(0, 10))) / 86400000;
        if (days > ctx.rules.claimDays) return en ? `This order is outside the ${ctx.rules.claimDays} day claim window.` : `เคลมไม่ได้ เกิน ${ctx.rules.claimDays} วันนับจากวันจัดส่งแล้วค่ะ`;
      }
    }
    return `${en ? 'Order' : 'ออเดอร์'} ${JSON.stringify(order)} ${polite}`;
  }
  const earliest = data.earliestPickup || data.earliestPickupDate;
  const errors = data.errors || (data.error ? [{ code: data.error }] : []);
  if (errors.length) {
    const text = errors.map(e => e.message || e.code).join(' · ');
    const contact = errors.some(e => /DISTANCE_TOO_FAR|QTY_MAX/.test(e.code)) ? ` ${ctx.shop?.phone || ''} ${ctx.shop?.line || ''}` : '';
    return `${text}${contact}${earliest ? ` ${earliest}` : ''} ${polite}`;
  }
  const labels = en ? ['Bottles', 'Discount', 'Logo', 'Shipping', 'Subtotal', 'VAT', 'Total'] : ['ค่าขวด', 'ส่วนลด', 'โลโก้', 'ค่าส่ง', 'ยอดก่อน VAT', 'VAT', 'รวม'];
  const keys = [['bottles', 'bottlesAmount', 'bottles_amount'], ['discount', 'discountAmount', 'discount_amount'], ['logo', 'logoAmount', 'logo_amount'], ['shipping', 'shippingAmount', 'shipping_amount'], ['subtotal', 'subtotalAmount', 'subtotal_amount'], ['vat', 'vatAmount', 'vat_amount'], ['total', 'totalAmount', 'total_amount']];
  const lines = data.lines || data.priceLines || data;
  const parts = [];
  if (data.quoteNo || data.quote_no) parts.push(`${data.quoteNo || data.quote_no} /quotes/${data.quoteNo || data.quote_no}`);
  if (data.validUntil || data.valid_until) parts.push(`${en ? 'Valid until' : 'หมดอายุ'} ${data.validUntil || data.valid_until}`);
  if (Array.isArray(lines)) {
    for (const l of lines) parts.push(`${l.label || l.key || l.name}: ${l.value ?? l.amount}`);
  } else {
    keys.forEach((aliases, i) => {
      const key = aliases.find(k => lines[k] !== undefined && typeof lines[k] !== 'boolean');
      if (key) parts.push(`${labels[i]} ${fmt(lines[key])}`);
    });
    const rate = lines.discountRate ?? lines.discount_rate;
    if (rate != null) parts.push(`${en ? 'Discount rate' : 'ลด'} ${Number((Number(rate) * 100).toFixed(4))}%`);
    const trips = lines.trips ?? data.trips;
    if (trips != null) parts.push(`${trips} ${en ? 'trips' : 'เที่ยว'}`);
  }
  if (earliest) parts.push(`${en ? 'Earliest pickup' : 'วันรับของเร็วสุด'} ${earliest}`);
  if (data.upsell) {
    const hint = data.upsell;
    const quantity = hint.targetQty ?? hint.quantity;
    const saving = hint.saving ?? hint.savings;
    parts.push(en ? `Order ${quantity != null ? count(quantity) : ''} bottles${hint.ratePercent != null ? ` for ${hint.ratePercent}% discount` : ''} to save ${saving != null ? fmt(saving) : ''}` : `ถ้าสั่ง ${quantity != null ? count(quantity) : ''} ใบ${hint.ratePercent != null ? ` จะได้ลด ${hint.ratePercent}%` : ''} จ่ายน้อยลง ${saving != null ? fmt(saving) : ''} บาท`);
  }
  if (!parts.length) parts.push(JSON.stringify(data));
  return `${parts.join('. ')}. ${polite}`;
}
export function answer(messages) {
  const ctx = contextOf(messages);
  const last = [...messages].reverse().find(m => m.role === 'user');
  const q = normalize(String(last?.content || ''));
  const original = [...messages].reverse().find(m => m.role === 'user' && !/^(PRICE|QUOTE|ORDER)_RESULT:/.test(m.content))?.content || '';
  const en = /[ก-๙]/.test(original) ? false : /[a-z]/i.test(original) ? true : ctx.lang === 'en';
  const result = q.match(/^(PRICE|QUOTE|ORDER)_RESULT:\s*([\s\S]*)$/);
  if (result) return resultAnswer(result[1], json(result[2]) || {}, ctx, en, original);
  const input = inputOf(messages, ctx);
  const products = ctx.products || [];
  const rules = ctx.rules || {};
  const product = products.find(p => (!input.model || p.model === input.model) && (!input.color || p.color === input.color));
  const th = (s, english) => en ? english : `${s}ค่ะ`;
  // Explicit three-sentence overview for streaming speech tests; catalog values stay in SQL context.
  if (/three sentences/.test(q)) return `We offer ${products.length} bottle variants for your business. Available bottle sizes are ${[...new Set(products.map(p => p.sizeMl))].join(', ')} ml, and you can ask about the model and colour that suit your products before placing your order. Tell us the bottle model, colour, quantity and delivery address so we can check your quotation and help you choose the next step for your business.`;
  if (/python|เขียนโค้ด|การเมือง|การบ้าน|politic|write.*code/i.test(q)) return th('ขออภัย ช่วยได้เฉพาะเรื่องขวดแก้วและบริการของใสใส ', 'Sorry, I can help with glass bottles and SaiSai services.');
  if (/1\s*ลิตร|หนึ่งลิตร|1\s*lit(?:er|re)|1000\s*ml/i.test(q) && !products.some(p => Number(p.sizeMl) === 1000)) return th('ไม่มีขวดขนาดนี้ในสินค้าของเรา ', 'We do not have this bottle size.');
  if (input.model && !products.some(p => p.model === input.model)) return th('ไม่มีขวดรุ่นนี้ในสินค้าของเรา ', 'We do not have this bottle model.');
  if (/เบอร์|ติดต่อ|เซลส์|sales|contact|phone/i.test(q) && !/ค่าส่ง|ราคา|price/i.test(q)) return th(`ติดต่อฝ่ายขาย ${ctx.shop?.phone || ''} LINE ${ctx.shop?.line || ''} `, `Contact sales: ${ctx.shop?.phone || ''}, LINE ${ctx.shop?.line || ''}.`);
  if (/บัญชี|โอนเข้า|bank|account/i.test(q)) return th(`${ctx.shop?.bank?.name || ''} ${ctx.shop?.bank?.account || ''} ${ctx.shop?.bank?.holder || ctx.shop?.name || ''} `, `${ctx.shop?.bank?.name || ''} ${ctx.shop?.bank?.account || ''} ${ctx.shop?.bank?.holder || ''}.`);
  const no = q.match(/SO-\d+/i)?.[0].toUpperCase();
  if (no) return `[ORDER_STATUS]${JSON.stringify({ orderNo: no })}`;
  if (/หมดอายุ|valid until|expir/i.test(q)) {
    const previous = [...messages].reverse().map(m => String(m.content)).find(s => /(?:validUntil|valid_until|หมดอายุ|Valid until)[^\d]*\d{4}-\d{2}-\d{2}/.test(s));
    if (previous) { const date = previous.match(/(?:validUntil|valid_until|หมดอายุ|Valid until)[^\d]*(\d{4}-\d{2}-\d{2})/i)?.[1]; if (date) return th(`ใบเสนอราคาหมดอายุ ${date} `, `Quotation valid until ${date}.`); }
  }
  if (/ขอ.*ใบเสนอราคา|ใบเสนอราคา.*(?:เลย|ด้วย)|quotation|request.*quote/i.test(q)) return `[QUOTE]${JSON.stringify(input)}`;
  if (/ตัวอย่าง|samples?/i.test(q)) return th(`ขวดตัวอย่างฟรี รุ่นละ ${rules.sampleQuota} ใบ ต่อบริษัทต่อเดือน `, `Free samples: ${rules.sampleQuota} bottles per model per company per month.`);
  if (/เครดิต|credit/i.test(q) && !/ครบกำหนด|นับยังไง|due/i.test(q)) return th(`ส่งแล้ว ${rules.creditAfter} ออเดอร์ ได้เครดิต ${rules.creditDays} วัน `, `After ${rules.creditAfter} delivered orders, credit terms are ${rules.creditDays} days.`);
  if (/ครบกำหนด|due date/i.test(q) && /(?:ส่ง|shipp)/i.test(q)) {
    const date = q.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const nov = q.match(/(\d+)\s*(?:พ\.?ย\.?|November|Nov\b)/i);
    const shipping = date || (nov && ctx.today ? `${ctx.today.slice(0, 4)}-11-${nov[1].padStart(2, '0')}` : null);
    if (shipping && rules.creditDays != null) return th(`ครบกำหนด ${new Date(Date.parse(`${shipping}T00:00:00Z`) + rules.creditDays * 86400000).toISOString().slice(0, 10)} `, `Due date: ${new Date(Date.parse(`${shipping}T00:00:00Z`) + rules.creditDays * 86400000).toISOString().slice(0, 10)}.`);
  }
  const docIntent = /เคลม|แตก|แนบรูป|ไฟล์แบบ|ล็อต|อนุมัติ.*โลโก้|แบบโลโก้|กล่องละ|เที่ยว.*กี่ใบ|ขนขวด|โปร|lead time|claim|carton|artwork|เริ่มผลิต|ครบกำหนด|due|ขั้นตอน/i.test(q);
  if (docIntent) {
    const response = documentAnswer(q + (/แนบรูป|ไฟล์แบบ|ล็อต/.test(q) ? ' เคลม' : ''), ctx, en);
    const hybrid = /ใบละ|price/i.test(q) && product ? `${product.model} ${product.colorTh || product.color}: ${fmt(product.price)}. ` : '';
    return hybrid + response;
  }
  if (/กี่แบบ|ขนาด.*อะไร|รุ่นอะไร|what sizes|sizes|models/i.test(q)) return th(`มี ${products.length} แบบ ขนาด ${[...new Set(products.map(p => p.sizeMl))].join('/')} ml `, `${products.length} variants, sizes ${[...new Set(products.map(p => p.sizeMl))].join('/')} ml.`);
  if (/สีอะไร|มีสี|colou?rs|สีเขียวมีรุ่น/i.test(q)) {
    const relevant = /สีเขียวมีรุ่น/.test(q) ? products.filter(p => p.color === 'green') : products.filter(p => !input.model || p.model === input.model);
    return th(`${[...new Set(relevant.map(p => `${p.model} ${p.colorTh || p.color}`))].join(', ')} ${/สีเขียวมีรุ่น/.test(q) ? documentAnswer(q, ctx, en) : ''} `, relevant.map(p => `${p.model} ${p.color}`).join(', ') + '.');
  }
  if (/ขั้นต่ำ|minimum/i.test(q) && !/โลโก้|logo/i.test(q) && product) return th(`${product.model} ขั้นต่ำ ${count(product.minQty)} ใบ `, `Minimum for ${product.model}: ${count(product.minQty)} bottles.`);
  if (/โลโก้|logo/i.test(q) && !input.quantity && !/ใบเสนอราคา/.test(q)) return th(`พิมพ์โลโก้ใบละ ${fmt(rules.logoPerUnit)} บาท ขั้นต่ำ ${count(rules.logoMinQty)} ใบ `, `Logo printing: ${fmt(rules.logoPerUnit)} THB each, minimum ${count(rules.logoMinQty)} bottles.`);
  if (/ใบละ|unit price|price of/i.test(q) && !/\d[\d,]*\s*(?:ใบ|bottles)/i.test(q) && product) return th(`${product.model} ${product.colorTh || product.color} ใบละ ${fmt(product.price)} บาท `, `${product.model} ${product.color}: ${fmt(product.price)} THB per bottle.`);
  if (/ราคา|เท่าไร|เท่าไหร่|กี่.*%|ส่วนลด|เปอร์เซ็นต์|ค่าส่ง|ส่ง.*แทน|ล่ะ|สั่ง|โลโก้|รับของเร็ว|เร็วที่สุด|price|cost|total|discount|shipping|earliest|pick.?up|กม\.?|กิโลเมตร|\bkm\b/i.test(q)) return `[PRICE]${JSON.stringify(input)}`;
  if (/สวัสดี|hello|hi\b/i.test(q)) return th('สวัสดี น้องใสยินดีช่วยเรื่องขวดแก้ว ', 'Hello! I can help with SaiSai glass bottles.');
  return documentAnswer(q, ctx, en);
}
