"""Write only T13-owned one-case-per-file browser specifications."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[3]
base="""import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });
"""
def write(code,body):
 (root/'e2e/tests'/f'{code}.spec.ts').write_text(base+f"\ntest('{code} chat acceptance', async ({{ page }}) => {{\n  test.setTimeout(240_000);\n"+body+"\n  await hold(page);\n});\n")
def quote(s):return json.dumps(s,ensure_ascii=False)
def checks(checks,var='answer'):
 out=''
 for c in checks:
  if c.startswith('$'): out+=f'  expect(hasAmount({var}.text, {quote(c[1:])}), {var}.text).toBe(true);\n'
  else: out+=f'  expect({var}.text).toMatch(/{c}/i);\n'
 return out
cases=[
('ติดต่อเซลส์ได้ทางไหน',['02-000-0000','@saisai-test']),
('มีขวดกี่แบบ',['9','100','150','250','500']),
('ขวด 250 มล. สีเขียวใบละเท่าไร',['$5.80']),
('B-500 สั่งขั้นต่ำกี่ใบ',['800']),
('สั่ง B-250 ใส 10,000 ใบ ได้ส่วนลดกี่ %',['5\\s*%']),
('พิมพ์โลโก้ใบละเท่าไร ขั้นต่ำเท่าไร',['$0.80','5,?000']),
('25,000 ใบ ส่งไกล 160 กม. ค่าส่งเท่าไร',['2\\s*เที่ยว','$3000.00']),
('วันรับของเร็วสุดวันไหน',['2026-10-25|25.*ต.ค.*2026']),
('เมื่อไรจะได้เครดิต',['3','30']),
('ขอขวดตัวอย่างได้กี่ใบ',['3','รุ่น','เดือน','ฟรี']),
('มีขวด 1 ลิตรไหม',['ไม่มี|ไม่มีสินค้า']),
('ช่วยเขียนโค้ด Python ให้หน่อย',['ขออภัย|ขอโทษ|เฉพาะ','ขวด']),
('ขอใบเสนอราคา B-250 ใส 10,000 ใบ พิมพ์โลโก้ ส่งโรงงานนครสวรรค์',['QT-\\d+','$63023.00']),
('SO-0001 ถึงไหนแล้ว',['ไม่พบออเดอร์นี้'])]
for i,(question,cs) in enumerate(cases,1):
 code=f'C{i:02}'
 body=("  await login(page, 'arun@saisai.test');\n" if i>=13 else '')+"  await page.goto('/');\n  const answer = await askChat(page, "+quote(question)+");\n"+checks(cs)
 if i==14: body+="  expect(answer.text).not.toMatch(/ธีระ|C02|ยอด|\\d[\\d,]*\\.\\d{2}/);\n"
 if i==13:body+="  const r = await page.request.get('/api/quotes');\n  expect(JSON.stringify(await r.json())).toContain('QT-0001');\n"
 write(code,body)
rag=[
('ขวดแตกต้องแจ้งเคลมภายในกี่วัน ใช้รูปกี่รูป',['7','1(?:\\s*[–-]\\s*5|\\s*รูป.*(?:ไม่เกิน|สูงสุด)\\s*5)'],'SS-POLICY.pdf'),
('รถหนึ่งเที่ยวขนขวดได้กี่ใบ',['20,?000'],'SS-LOGISTICS.pdf'),
('ขวดสีเขียวมีรุ่นไหนบ้าง',['B-250'],'SS-CAT-BOTTLES.pdf'),
('อนุมัติแบบโลโก้ตอนไหน',['ยืนยันสเปก'],'SS-LOGO-PRINT.pdf'),
('B-500 กล่องละกี่ใบ',['24'],'SS-LOGISTICS.pdf'),
('B-500 สีชาใบละเท่าไร แล้วเคลมได้ภายในกี่วัน',['$8.40','7'],'SS-POLICY.pdf'),
('เดือนพฤศจิกายนมีโปรอะไร',['ออกแบบโลโก้ฟรี'],'SS-PROMO-NOV.pdf'),
('What is the lead time?',['14\\s*days'],'SS-FAQ-EN.pdf|SS-POLICY.pdf')]
for i,(q,cs,file) in enumerate(rag,1):
 body=''
 if i==7:body+="""  await login(page, 'wichai@saisai.test', { goto: '/admin/docs' });
  await page.getByTestId('doc-upload-input').setInputFiles(new URL('../fixtures/SS-PROMO-NOV.pdf', import.meta.url).pathname);
  await page.getByTestId('doc-upload-submit').click();
  await expect(page.locator('[data-testid="doc-row"][data-filename="SS-PROMO-NOV.pdf"]')).toHaveAttribute('data-status', 'ready', { timeout: 150_000 });
"""
 body+="  await page.goto('/');\n  const answer = await askChat(page, "+quote(q)+");\n"+checks(cs)
 body+=f"  expect(answer.cites.some(c => /{file.replace('.', chr(92)+'.')}/.test(c.filename)), JSON.stringify(answer)).toBe(true);\n"
 body+="  for (const cite of answer.cites) {\n    expect(cite.page).toBeGreaterThan(0);\n    const link = page.getByTestId('chat-msg-bot').nth(answer.index).locator(`[data-testid=chat-cite][data-filename='${cite.filename}'][data-page='${cite.page}']`);\n    await expect(link).toHaveAttribute('href', `/api/docs/${cite.filename}#page=${cite.page}`);\n    await expect(link).toHaveAttribute('target', '_blank');\n  }\n"
 write(f'R{i:02}',body)
multi=[('arun',[
('B-250 มีสีอะไร',['ใส','ชา','เขียว']),('สีเขียวใบละเท่าไร',['$5.80']),('ขั้นต่ำเท่าไร',['1,?200']),('ถ้าหมื่นใบค่าขวดเท่าไร',['$58000.00','$2900.00','5\\s*%']),('ใส่โลโก้ด้วยเพิ่มเท่าไร',['$8000.00'])]),
('arun', [('ราคา B-100 ใส 9,600 ใบ ส่งคลังบางนา',['$30720.00','$2150.40','$32870.40','10,?000','$320.00']),('แล้วถ้าหมื่นใบล่ะ',['$30400.00','$32528.00']),('รับของเร็วสุดวันไหน',['2026-10-25']),('ขอใบเสนอราคาเลย',['QT-\\d+']),('ใบนี้หมดอายุเมื่อไร',['2026-10-18'])]),
('arun',[('B-500 ใส 25,000 ใบ ส่งนครสวรรค์ 160 กม. ค่าส่งเท่าไร',['2\\s*เที่ยว','$3000.00']),('ถ้าส่งลาดกระบังแทน',['ค่าส่ง\\s*(?:฿\\s*)?0(?:\\.00)?|ส่งฟรี']),('ฉะเชิงเทราล่ะ',['$3000.00']),('ถ้าไกลเกิน 300 กม.',['DISTANCE_TOO_FAR|เซลส์|sales']),('เบอร์อะไร',['02-000-0000'])]),
('theera',[('เคลมได้ภายในกี่วัน',['7']),('ต้องแนบรูปกี่รูป',['1(?:\\s*[–-]\\s*5|\\s*รูป.*(?:ไม่เกิน|สูงสุด)\\s*5)']),('ไฟล์แบบไหน',['JPG','PNG','5\\s*MB']),('เลขล็อตเขียนยังไง',['LOT-','6']),('SO-0001 เคลมได้ไหม',['ไม่ได้|เกิน','7'])]),
(None,[('ได้เครดิตเมื่อไร',['3','ออเดอร์']),('ครบกำหนดนับยังไง',['วันจัดส่ง','30']),('ถ้าส่ง 1 พ.ย. ครบกำหนดวันไหน',['2026-12-01']),('โอนเข้าบัญชีอะไร',['ธนาคารทดสอบ','000-0-00000-0']),('ยังไม่โอนเริ่มผลิตได้ไหม',['ไม่ได้|ต้อง.*รับเงิน|บันทึกรับเงิน'])]),
('kenji',[('What sizes?',['100','150','250','500']),('Price of B-150 amber?',['$4.10']),('Minimum?',['1,?800']),('Free samples?',['3','per model','month']),('Earliest pickup?',['2026-10-25'])])]
for i,(user,turns) in enumerate(multi,1):
 body=(f"  await login(page, '{user}@saisai.test');\n" if user else '')+"  await page.goto('/');\n"
 for j,(q,cs) in enumerate(turns):
  body+=f'  const a{j} = await askChat(page, {quote(q)});\n'+checks(cs,f'a{j}')
 body+="  expect(await page.getByTestId('chat-msg-user').count()).toBe(5);\n  expect(await page.getByTestId('chat-msg-bot').count()).toBe(5);\n"
 write(f'M{i:02}',body)
write('Q02',"""  await page.goto('/');
  await openChat(page);
  await stopService('chat-worker');
  try {
    await typeSlow(page.getByTestId('chat-input'), 'B-500 ขั้นต่ำกี่ใบ');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-status')).toContainText('รอคิว');
    await hold(page, 3500);
  } finally { await startService('chat-worker'); }
  await expect(page.getByTestId('chat-msg-bot').last()).toHaveAttribute('data-done', 'true', { timeout: 100_000 });
  await expect(page.getByTestId('chat-msg-bot').last()).toContainText('800');
  await expect(page.getByTestId('chat-msg-user')).toHaveCount(1);
""")
