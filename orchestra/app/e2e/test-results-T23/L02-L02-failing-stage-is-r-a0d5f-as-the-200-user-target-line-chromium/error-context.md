# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: L02.spec.ts >> L02 failing stage is red and the chart has the 200-user target line
- Location: tests/L02.spec.ts:13:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: locator('.load-run[data-run-id="29"]').getByTestId('load-chart')
Expected: "8"
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" locator('.load-run[data-run-id="29"]').getByTestId('load-chart') with timeout 20000ms
  - waiting for locator('.load-run[data-run-id="29"]').getByTestId('load-chart')

```

```yaml
- banner:
  - text: "โหมดทดสอบ: วันนี้ = 2026-10-11 10:00"
  - link "ใสใส กลาสแวร์":
    - /url: /
  - navigation:
    - link "หน้าแรก":
      - /url: /
    - link "สินค้า":
      - /url: /products
    - link "ออเดอร์ทั้งหมด":
      - /url: /staff/orders
    - link "เคลมทั้งหมด":
      - /url: /staff/claims
    - link "วันหยุดโรงงาน":
      - /url: /owner/holidays
    - link "เอกสาร":
      - /url: /admin/docs
    - link "ประเมิน RAG":
      - /url: /admin/eval
    - link "Load test":
      - /url: /admin/load
  - button "Switch to English": EN
  - text: คุณวิชัย (เจ้าของโรงงาน)
  - button "ออกจากระบบ"
- main:
  - heading "ผล Load test" [level=1]
  - region "GPU scale comparison":
    - heading "GPU baseline · ×2 · ×4 (AI)" [level=2]
    - article:
      - heading "scale-base" [level=3]
      - paragraph: รองรับพร้อมกันได้ 0 คน
      - paragraph: gpu-mix-scale-base-nocache-r2
      - paragraph: "อัตราขยาย: ยังประเมินไม่ได้"
    - article:
      - heading "scale-x2" [level=3]
      - paragraph: ยังไม่ได้วัด
      - paragraph: ไม่มีผล AI ที่ตรงเงื่อนไข
      - paragraph: "อัตราขยาย: ยังประเมินไม่ได้"
    - article:
      - heading "scale-x4" [level=3]
      - paragraph: ยังไม่ได้วัด
      - paragraph: ไม่มีผล AI ที่ตรงเงื่อนไข
      - paragraph: "อัตราขยาย: ยังประเมินไม่ได้"
    - paragraph: mix · think 30 วิ · stage 120 วิ · cache off รวม TTS · prefetch 4/4/2 · p95 ≤ 12 วิ · error < 1%
    - status: "Baseline N=0: ยังประเมินอัตราขยายไม่ได้"
    - figure "ผสม (แชท + เสียง) · เวลาตอบ (วินาที) ตามจำนวนผู้ใช้พร้อมกัน · ด้านล่าง = คิวยาวสุด":
      - text: ผสม (แชท + เสียง) · เวลาตอบ (วินาที) ตามจำนวนผู้ใช้พร้อมกัน · ด้านล่าง = คิวยาวสุด gpu-mix-scale-base-nocache-r2 p95 คิว chat คิว stt คิว tts
      - img "กราฟเวลาตอบโหมด mix 1 จุด": 0 13 25 38 50 วินาที เกณฑ์ p95 12 วิ เป้า 200 คน → p95 10 0 คิวยาวสุด 1 ✗ ผู้ใช้พร้อมกัน (คน)
    - paragraph: กราฟแสดงเฉพาะชุดที่วัดแล้ว ชุดที่ยังไม่ได้วัดไม่มีเส้น
  - paragraph: "ตัวเลขหลัก (ปิด cache · คำถามไม่ซ้ำสุ่มจาก 770 ข้อ · prefetch 4/4/2): รองรับพร้อมกัน เสียงครบวง 0 คน — run #27 gpu-voice-tune-ttsprefetch1 · run ที่เปิด cache/คำถามซ้ำ = ข้อมูลเสริม"
  - heading "load-run-a (mock fixture) 27/10/2569 21:50:50 เสริม · ไม่ระบุ cache · ข้อมูลสังเคราะห์" [level=2]
  - article:
    - heading "ผสม (แชท + เสียง)" [level=3]
    - paragraph:
      - text: รองรับพร้อมกันได้
      - strong: "200"
      - text: คน
  - paragraph: mode=mix · stage_sec=120 · synthetic=true · think_sec=30 · environment=mock
  - paragraph: "เกณฑ์ผ่านต่อขั้น: p95 ≤ 12 วิ · error ≤ 1% · เป้า 200 คน · N = ขั้นสูงสุดที่ผ่านโดยทุกขั้นก่อนหน้าผ่าน"
  - text: เลือก run (กด Ctrl/⌘ เพื่อเลือกหลาย run มาเทียบกัน)
  - listbox "เลือก run (กด Ctrl/⌘ เพื่อเลือกหลาย run มาเทียบกัน)":
    - 'option "[เสริม] #29 load-run-a (mock fixture) · mix · 27/10/2569 21:50:50" [selected]'
    - 'option "[เสริม] #28 load-run-a (mock fixture) · mix · 27/10/2569 21:49:16"'
    - 'option "[หลัก] #27 gpu-voice-tune-ttsprefetch1 · voice · 27/10/2569 13:49:01"'
    - 'option "[หลัก] #26 gpu-tts-nocache-rerank · tts · 27/10/2569 13:46:08"'
    - 'option "[หลัก] #25 gpu-mix-scale-base-nocache-r2 · mix · 27/10/2569 13:43:26"'
    - 'option "[หลัก] #24 gpu-voice-nocache-r2 · voice · 27/10/2569 13:41:16"'
    - 'option "[หลัก] #23 gpu-stt-nocache-r2 · stt · 27/10/2569 13:36:45"'
    - 'option "[หลัก] #22 gpu-mix-scale-base-nocache · mix · 27/10/2569 13:20:05"'
    - 'option "[หลัก] #21 gpu-voice-nocache · voice · 27/10/2569 13:15:38"'
    - 'option "[หลัก] #20 gpu-tts-nocache · tts · 27/10/2569 13:13:03"'
    - 'option "[หลัก] #19 gpu-stt-nocache · stt · 27/10/2569 13:10:47"'
    - 'option "[หลัก] #18 gpu-chat-nocache · chat · 27/10/2569 13:04:25"'
    - 'option "[เสริม] #17 load-run-a (mock fixture) · mix · 27/10/2569 12:21:43"'
    - 'option "[เสริม] #16 load-run-a (mock fixture) · mix · 27/10/2569 12:21:30"'
    - 'option "[หลัก] #15 T22-mock-cold-tts · mix · 27/10/2569 10:24:02"'
    - 'option "[เสริม] #14 load-run-a (mock fixture) · mix · 27/10/2569 10:01:00"'
    - 'option "[เสริม] #13 load-run-a (mock fixture) · mix · 27/10/2569 10:00:38"'
    - 'option "[เสริม] #12 mock-mix-nocache-prefetch48 · mix · 27/10/2569 09:58:34"'
    - 'option "[เสริม] #11 mock-mix-nocache-pruned · mix · 27/10/2569 09:38:15"'
    - 'option "[เสริม] #10 mock-mix-nocache · mix · 26/10/2569 21:40:05"'
    - 'option "[เสริม] #9 load-run-a (mock fixture) · mix · 26/10/2569 13:58:30"'
    - 'option "[เสริม] #8 load-run-a (mock fixture) · mix · 26/10/2569 13:58:13"'
    - 'option "[เสริม] #7 load-run-a (mock fixture) · mix · 26/10/2569 13:23:36"'
    - 'option "[เสริม] #6 load-run-a (mock fixture) · mix · 26/10/2569 13:23:19"'
    - 'option "[เสริม] #5 load-run-a (mock fixture) · mix · 26/10/2569 12:40:57"'
    - 'option "[เสริม] #4 load-run-a (mock fixture) · mix · 26/10/2569 12:40:45"'
    - 'option "[เสริม] #3 mock-mix · mix · 26/10/2569 12:28:46"'
    - 'option "[เสริม] #2 mock-mix-prefetch-only · mix · 26/10/2569 12:06:08"'
    - 'option "[เสริม] #1 mock-mix-baseline · mix · 26/10/2569 11:45:49"'
  - figure "ผสม (แชท + เสียง) · เวลาตอบ (วินาที) ตามจำนวนผู้ใช้พร้อมกัน · ด้านล่าง = คิวยาวสุด":
    - text: ผสม (แชท + เสียง) · เวลาตอบ (วินาที) ตามจำนวนผู้ใช้พร้อมกัน · ด้านล่าง = คิวยาวสุด load-run-a (mock fixture) p50 p95 TTFT p95 คิว chat คิว stt คิว tts
    - img "กราฟเวลาตอบโหมด mix 8 จุด": 0 5 10 15 20 วินาที เกณฑ์ p95 12 วิ เป้า 200 คน N = 200 p50 p95 TTFT p95 50 0 คิวยาวสุด 1 10 25 50 100 150 200 250 ✗ ผู้ใช้พร้อมกัน (คน)
  - table "load-run-a (mock fixture) · ผสม (แชท + เสียง) · ผลต่อขั้น":
    - caption: load-run-a (mock fixture) · ผสม (แชท + เสียง) · ผลต่อขั้น
    - rowgroup:
      - row "ผู้ใช้ n ok error error rate p50 (วิ) p95 (วิ) TTFT p95 (วิ) คิว chat คิว stt คิว tts ผล":
        - columnheader "ผู้ใช้"
        - columnheader "n"
        - columnheader "ok"
        - columnheader "error"
        - columnheader "error rate"
        - columnheader "p50 (วิ)"
        - columnheader "p95 (วิ)"
        - columnheader "TTFT p95 (วิ)"
        - columnheader "คิว chat"
        - columnheader "คิว stt"
        - columnheader "คิว tts"
        - columnheader "ผล"
    - rowgroup:
      - row "1 1000 1000 0 0.0% 0.80 1.20 0.40 0 0 0 ✓ ผ่าน":
        - cell "1"
        - cell "1000"
        - cell "1000"
        - cell "0"
        - cell "0.0%"
        - cell "0.80"
        - cell "1.20"
        - cell "0.40"
        - cell "0"
        - cell "0"
        - cell "0"
        - cell "✓ ผ่าน"
      - row "10 1000 1000 0 0.0% 1.00 1.80 0.50 5 2 3 ✓ ผ่าน":
        - cell "10"
        - cell "1000"
        - cell "1000"
        - cell "0"
        - cell "0.0%"
        - cell "1.00"
        - cell "1.80"
        - cell "0.50"
        - cell "5"
        - cell "2"
        - cell "3"
        - cell "✓ ผ่าน"
      - row "25 1000 1000 0 0.0% 1.40 2.50 0.65 10 4 6 ✓ ผ่าน":
        - cell "25"
        - cell "1000"
        - cell "1000"
        - cell "0"
        - cell "0.0%"
        - cell "1.40"
        - cell "2.50"
        - cell "0.65"
        - cell "10"
        - cell "4"
        - cell "6"
        - cell "✓ ผ่าน"
      - row "50 1000 1000 0 0.0% 1.80 3.20 0.80 15 6 9 ✓ ผ่าน":
        - cell "50"
        - cell "1000"
        - cell "1000"
        - cell "0"
        - cell "0.0%"
        - cell "1.80"
        - cell "3.20"
        - cell "0.80"
        - cell "15"
        - cell "6"
        - cell "9"
        - cell "✓ ผ่าน"
      - row "100 1000 1000 0 0.0% 2.50 4.80 1.10 20 8 12 ✓ ผ่าน":
        - cell "100"
        - cell "1000"
        - cell "1000"
        - cell "0"
        - cell "0.0%"
        - cell "2.50"
        - cell "4.80"
        - cell "1.10"
        - cell "20"
        - cell "8"
        - cell "12"
        - cell "✓ ผ่าน"
      - row "150 1000 1000 0 0.0% 3.50 7.00 1.60 25 10 15 ✓ ผ่าน":
        - cell "150"
        - cell "1000"
        - cell "1000"
        - cell "0"
        - cell "0.0%"
        - cell "3.50"
        - cell "7.00"
        - cell "1.60"
        - cell "25"
        - cell "10"
        - cell "15"
        - cell "✓ ผ่าน"
      - row "200 1000 1000 0 0.0% 4.80 11.00 2.40 30 12 18 ✓ ผ่าน":
        - cell "200"
        - cell "1000"
        - cell "1000"
        - cell "0"
        - cell "0.0%"
        - cell "4.80"
        - cell "11.00"
        - cell "2.40"
        - cell "30"
        - cell "12"
        - cell "18"
        - cell "✓ ผ่าน"
      - row "250 1000 970 30 3.0% 7.80 16.00 4.80 35 14 21 ✗ ไม่ผ่าน":
        - cell "250"
        - cell "1000"
        - cell "970"
        - cell "30"
        - cell "3.0%"
        - cell "7.80"
        - cell "16.00"
        - cell "4.80"
        - cell "35"
        - cell "14"
        - cell "21"
        - cell "✗ ไม่ผ่าน"
- button "💬 คุยกับน้องใส"
- alert
```

# Test source

```ts
  1  | import { readFileSync } from 'node:fs';
  2  | import { test, expect } from '@playwright/test';
  3  | import { reset, login, hold } from '../lib/helpers';
  4  | 
  5  | const fixture = JSON.parse(readFileSync(new URL('../fixtures/load-run-a.json', import.meta.url), 'utf8'));
  6  | const failing: number[] = fixture.stages.filter((s: { pass: boolean }) => !s.pass).map((s: { users: number }) => s.users);
  7  | const RED = 'rgb(198, 40, 40)';
  8  | 
  9  | test.beforeEach(async ({ request }) => {
  10 |   await reset(request);
  11 | });
  12 | 
  13 | test('L02 failing stage is red and the chart has the 200-user target line', async ({ page }) => {
  14 |   expect(failing).toEqual([250]);
  15 |   await login(page, 'wichai@saisai.test');
  16 |   const r = await page.request.post('/api/admin/load', { data: fixture }); // owner cookie
  17 |   expect(r.status(), await r.text()).toBe(201);
  18 |   const { run } = await r.json();
  19 | 
  20 |   await page.goto(`/admin/load?runs=${run.id}`);
  21 |   const selectedRun = page.locator(`.load-run[data-run-id="${run.id}"]`);
  22 |   const chart = selectedRun.getByTestId('load-chart');
> 23 |   await expect(chart).toHaveAttribute('data-points', '8');
     |                       ^ Error: expect(locator).toHaveAttribute(expected) failed
  24 | 
  25 |   // ตาราง: ขั้นไม่ผ่านเป็นสีแดง · ขั้นผ่านไม่แดง
  26 |   const bad = selectedRun.locator('[data-testid="load-stage-row"][data-pass="false"]');
  27 |   await expect(bad).toHaveCount(failing.length);
  28 |   await expect(bad).toHaveAttribute('data-users', '250');
  29 |   await expect(bad).toContainText('ไม่ผ่าน');
  30 |   await expect(bad.locator('td').first()).toHaveCSS('color', RED);
  31 |   await expect(bad.locator('td').first()).toHaveCSS('background-color', 'rgb(253, 231, 231)');
  32 |   const good = selectedRun.locator('[data-testid="load-stage-row"][data-pass="true"]');
  33 |   await expect(good).toHaveCount(7);
  34 |   await expect(good.first().locator('td').first()).not.toHaveCSS('color', RED);
  35 | 
  36 |   // กราฟ: จุดขั้น 250 แดง + แถบแดง + ป้ายแกน X แดง
  37 |   const badPoint = chart.locator('[data-series="p95_ms"] circle[data-users="250"]');
  38 |   await expect(badPoint).toHaveAttribute('data-pass', 'false');
  39 |   await expect(badPoint).toHaveAttribute('fill', '#C62828');
  40 |   await expect(chart.getByTestId('load-fail-band')).toHaveAttribute('data-users', '250');
  41 |   await expect(chart.locator('text', { hasText: '250 ✗' })).toHaveCSS('fill', RED);
  42 | 
  43 |   // เส้นเป้า 200 · เส้นเกณฑ์ 12 วิ · เส้นตั้งที่ N
  44 |   const target = chart.getByTestId('load-target-line');
  45 |   await expect(target).toHaveAttribute('data-value', '200');
  46 |   await expect(target).toContainText('เป้า 200 คน');
  47 |   const targetX = Number(await target.locator('line').getAttribute('x1'));
  48 |   const x200 = Number(await chart.locator('[data-series="p95_ms"] circle[data-users="200"]').getAttribute('cx'));
  49 |   expect(Math.abs(targetX - x200)).toBeLessThan(0.5);
  50 |   await expect(chart.getByTestId('load-criteria-line')).toHaveAttribute('data-value', '12000');
  51 |   await expect(chart.getByTestId('load-n-line')).toHaveAttribute('data-value', String(fixture.max_users_ok.mix));
  52 |   await bad.scrollIntoViewIfNeeded();
  53 |   await hold(page);
  54 | });
  55 | 
```