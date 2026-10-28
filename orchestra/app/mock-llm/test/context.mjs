import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url);
const seed = readFileSync(new URL('legacy/db/init/02-seed.sql', root), 'utf8');
const rules = readFileSync(new URL('legacy/web/lib/rules.ts', root), 'utf8');
const value = name => {
  const v = rules.match(new RegExp(`export const ${name} = ([^;]+);`))[1].replaceAll('_', '');
  return JSON.parse(v.replaceAll("'", '"'));
};
const models = Object.fromEntries([...seed.matchAll(/\('(B-\d+)', (\d+), (\d+)\)/g)].map(m => [m[1], { sizeMl: Number(m[2]), minQty: Number(m[3]) }]));
const products = [...seed.matchAll(/\(\d+, '(P\d+)', '(B-\d+)', '(clear|amber|green)', (\d+\.\d+),/g)].map(m => ({ code: m[1], model: m[2], color: m[3], colorTh: { clear: 'ใส', amber: 'ชา', green: 'เขียว' }[m[3]], price: m[4], slug: `${m[2].toLowerCase().replace('-', '')}-${m[3]}`, ...models[m[2]] }));
const addresses = [...seed.matchAll(/\(\d+, '(ADDR-\d+)', 1, '([^']+)', '[^']+', '[^']+', '[^']+', (\d+),/g)].map(m => ({ code: m[1], label: m[2], distanceKm: Number(m[3]) }));
export const ctx = {
  shop: { name: seed.match(/INSERT INTO shop_settings VALUES \(1, '([^']+)'/)[1], phone: '02-000-0000', line: '@saisai-test', bank: { name: 'ธนาคารทดสอบ', account: '000-0-00000-0', holder: 'บจก. ใสใส กลาสแวร์' } },
  today: '2026-10-11', lang: 'th', loggedIn: true,
  company: { code: 'C01', name: 'อรุณเฮลท์ดริงก์', addresses, credit: { deliveredCount: 3, terms: 'credit30' }, recentOrders: [] },
  products, rules: {
    orderStep: value('QTY_STEP'), maxQty: value('QTY_MAX'), logoPerUnit: value('LOGO_UNIT_PRICE'), logoMinQty: value('LOGO_MIN_QTY'), freeKm: value('FREE_SHIPPING_MAX_KM'), tripFee: value('SHIPPING_PER_TRIP'), tripSize: value('TRIP_CAPACITY'), salesKm: value('MAX_DISTANCE_KM'), leadDays: value('PICKUP_LEAD_DAYS'), holidays: ['2026-10-23', '2026-12-05', '2026-12-31'], creditAfter: value('CREDIT_MIN_SHIPPED'), creditDays: value('CREDIT_DAYS'), sampleQuota: value('SAMPLE_MAX_PER_MODEL'), claimDays: value('CLAIM_WINDOW_DAYS'),
  }, chunks: [],
};
// Extract real PDF text with PyMuPDF. No handcrafted PDF facts in the mock.
export const pages = JSON.parse(execFileSync('python3', ['-c', `
import fitz, json, pathlib
out=[]
for path in sorted(pathlib.Path('docs/pdf').glob('*.pdf')):
 for n,page in enumerate(fitz.open(path)):
  out.append(dict(filename=path.name,page=n+1,text=page.get_text()))
print(json.dumps(out,ensure_ascii=False))
`], { cwd: root, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
export function page(filename, n, cite = 1) { return { ...pages.find(p => p.filename === filename && p.page === n), n: cite }; }
export function messages(question, extra = {}, history = []) { return [{ role: 'system', content: `You are Nong Sai.\nCTX_JSON: ${JSON.stringify({ ...ctx, ...extra })}` }, ...history, { role: 'user', content: question }]; }
export function user(content) { return { role: 'user', content }; }
export function assistant(content) { return { role: 'assistant', content }; }
