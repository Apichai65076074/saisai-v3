# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: L01.spec.ts >> L01 POST load-run-a.json → load-chart 8 points and load-max-users from the file
- Location: tests/L01.spec.ts:11:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.load-run[data-run-id="28"]').getByTestId('load-chart')
Expected: 1
Received: 0
Timeout:  20000ms

Call log:
  - Expect "toHaveCount" locator('.load-run[data-run-id="28"]').getByTestId('load-chart') with timeout 20000ms
  - waiting for locator('.load-run[data-run-id="28"]').getByTestId('load-chart')
    42 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - banner [ref=f1e2]:
    - generic [ref=f1e3]: "โหมดทดสอบ: วันนี้ = 2026-10-11 10:00"
    - generic [ref=f1e4]:
      - link "ใสใส กลาสแวร์" [ref=f1e5] [cursor=pointer]:
        - /url: /
      - navigation [ref=f1e7]:
        - link "หน้าแรก" [ref=f1e8] [cursor=pointer]:
          - /url: /
        - link "สินค้า" [ref=f1e9] [cursor=pointer]:
          - /url: /products
        - link "ออเดอร์ทั้งหมด" [ref=f1e10] [cursor=pointer]:
          - /url: /staff/orders
        - link "เคลมทั้งหมด" [ref=f1e11] [cursor=pointer]:
          - /url: /staff/claims
        - link "วันหยุดโรงงาน" [ref=f1e12] [cursor=pointer]:
          - /url: /owner/holidays
        - link "เอกสาร" [ref=f1e13] [cursor=pointer]:
          - /url: /admin/docs
        - link "ประเมิน RAG" [ref=f1e14] [cursor=pointer]:
          - /url: /admin/eval
        - link "Load test" [ref=f1e15] [cursor=pointer]:
          - /url: /admin/load
      - generic [ref=f1e16]:
        - button "Switch to English" [ref=f1e17] [cursor=pointer]: EN
        - generic [ref=f1e18]: คุณวิชัย (เจ้าของโรงงาน)
        - button "ออกจากระบบ" [ref=f1e19] [cursor=pointer]
  - main [ref=f1e20]:
    - generic [ref=f1e21]:
      - heading "ผล Load test" [level=1] [ref=f1e22]
      - region "GPU scale comparison" [ref=f1e23]:
        - heading "GPU baseline · ×2 · ×4 (AI)" [level=2] [ref=f1e24]
        - generic [ref=f1e25]:
          - article [ref=f1e26]:
            - heading "scale-base" [level=3] [ref=f1e27]
            - paragraph [ref=f1e28]: รองรับพร้อมกันได้ 0 คน
            - paragraph [ref=f1e29]: gpu-mix-scale-base-nocache-r2
            - paragraph [ref=f1e30]: "อัตราขยาย: ยังประเมินไม่ได้"
          - article [ref=f1e31]:
            - heading "scale-x2" [level=3] [ref=f1e32]
            - paragraph [ref=f1e33]: ยังไม่ได้วัด
            - paragraph [ref=f1e34]: ไม่มีผล AI ที่ตรงเงื่อนไข
            - paragraph [ref=f1e35]: "อัตราขยาย: ยังประเมินไม่ได้"
          - article [ref=f1e36]:
            - heading "scale-x4" [level=3] [ref=f1e37]
            - paragraph [ref=f1e38]: ยังไม่ได้วัด
            - paragraph [ref=f1e39]: ไม่มีผล AI ที่ตรงเงื่อนไข
            - paragraph [ref=f1e40]: "อัตราขยาย: ยังประเมินไม่ได้"
        - paragraph [ref=f1e41]: mix · think 30 วิ · stage 120 วิ · cache off รวม TTS · prefetch 4/4/2 · p95 ≤ 12 วิ · error < 1%
        - status [ref=f1e42]: "Baseline N=0: ยังประเมินอัตราขยายไม่ได้"
        - figure "ผสม (แชท + เสียง) · เวลาตอบ (วินาที) ตามจำนวนผู้ใช้พร้อมกัน · ด้านล่าง = คิวยาวสุด" [ref=f1e43]:
          - generic [ref=f1e45]:
            - generic [ref=f1e46]: gpu-mix-scale-base-nocache-r2
            - generic [ref=f1e48]: p95
            - generic [ref=f1e50]: คิว chat
            - generic [ref=f1e52]: คิว stt
            - generic [ref=f1e54]: คิว tts
          - img "กราฟเวลาตอบโหมด mix 1 จุด" [ref=f1e56]:
            - generic [ref=f1e58]: "0"
            - generic [ref=f1e60]: "13"
            - generic [ref=f1e62]: "25"
            - generic [ref=f1e64]: "38"
            - generic [ref=f1e66]: "50"
            - generic [ref=f1e68]: วินาที
            - generic [ref=f1e69]: เกณฑ์ p95 12 วิ
            - generic [ref=f1e71]: เป้า 200 คน →
            - generic [ref=f1e73]:
              - generic "gpu-mix-scale-base-nocache-r2 · 1 คน · p95 25.90 วิ · error 25.0% · ไม่ผ่าน" [ref=f1e74]
              - generic [ref=f1e75]: p95
            - generic [ref=f1e76]: "10"
            - generic [ref=f1e77]: "0"
            - generic [ref=f1e78]: คิวยาวสุด
            - generic [ref=f1e79]:
              - generic "1 คน · คิว chat ยาวสุด 1" [ref=f1e80]
              - generic "1 คน · คิว stt ยาวสุด 1" [ref=f1e81]
              - generic "1 คน · คิว tts ยาวสุด 9" [ref=f1e82]
            - generic [ref=f1e83]: 1 ✗
            - generic [ref=f1e84]: ผู้ใช้พร้อมกัน (คน)
        - paragraph [ref=f1e85]: กราฟแสดงเฉพาะชุดที่วัดแล้ว ชุดที่ยังไม่ได้วัดไม่มีเส้น
      - paragraph [ref=f1e86]: "ตัวเลขหลัก (ปิด cache · คำถามไม่ซ้ำสุ่มจาก 770 ข้อ · prefetch 4/4/2): รองรับพร้อมกัน เสียงครบวง 0 คน — run #27 gpu-voice-tune-ttsprefetch1 · run ที่เปิด cache/คำถามซ้ำ = ข้อมูลเสริม"
      - generic [ref=f1e87]:
        - heading "load-run-a (mock fixture) 27/10/2569 21:49:16 เสริม · ไม่ระบุ cache · ข้อมูลสังเคราะห์" [level=2] [ref=f1e88]:
          - text: load-run-a (mock fixture)
          - generic [ref=f1e90]: 27/10/2569 21:49:16
          - generic [ref=f1e91]: เสริม · ไม่ระบุ cache · ข้อมูลสังเคราะห์
        - article [ref=f1e93]:
          - heading "ผสม (แชท + เสียง)" [level=3] [ref=f1e94]
          - paragraph [ref=f1e95]:
            - text: รองรับพร้อมกันได้
            - strong [ref=f1e96]: "200"
            - text: คน
        - paragraph [ref=f1e97]: mode=mix · stage_sec=120 · synthetic=true · think_sec=30 · environment=mock
      - paragraph [ref=f1e98]: "เกณฑ์ผ่านต่อขั้น: p95 ≤ 12 วิ · error ≤ 1% · เป้า 200 คน · N = ขั้นสูงสุดที่ผ่านโดยทุกขั้นก่อนหน้าผ่าน"
      - generic [ref=f1e99]:
        - generic [ref=f1e100]: เลือก run (กด Ctrl/⌘ เพื่อเลือกหลาย run มาเทียบกัน)
        - listbox "เลือก run (กด Ctrl/⌘ เพื่อเลือกหลาย run มาเทียบกัน)" [ref=f1e101]:
          - 'option "[เสริม] #28 load-run-a (mock fixture) · mix · 27/10/2569 21:49:16" [selected] [ref=f1e102]'
          - 'option "[หลัก] #27 gpu-voice-tune-ttsprefetch1 · voice · 27/10/2569 13:49:01" [ref=f1e103]'
          - 'option "[หลัก] #26 gpu-tts-nocache-rerank · tts · 27/10/2569 13:46:08" [ref=f1e104]'
          - 'option "[หลัก] #25 gpu-mix-scale-base-nocache-r2 · mix · 27/10/2569 13:43:26" [ref=f1e105]'
          - 'option "[หลัก] #24 gpu-voice-nocache-r2 · voice · 27/10/2569 13:41:16" [ref=f1e106]'
          - 'option "[หลัก] #23 gpu-stt-nocache-r2 · stt · 27/10/2569 13:36:45" [ref=f1e107]'
          - 'option "[หลัก] #22 gpu-mix-scale-base-nocache · mix · 27/10/2569 13:20:05" [ref=f1e108]'
          - 'option "[หลัก] #21 gpu-voice-nocache · voice · 27/10/2569 13:15:38" [ref=f1e109]'
          - 'option "[หลัก] #20 gpu-tts-nocache · tts · 27/10/2569 13:13:03" [ref=f1e110]'
          - 'option "[หลัก] #19 gpu-stt-nocache · stt · 27/10/2569 13:10:47" [ref=f1e111]'
          - 'option "[หลัก] #18 gpu-chat-nocache · chat · 27/10/2569 13:04:25" [ref=f1e112]'
          - 'option "[เสริม] #17 load-run-a (mock fixture) · mix · 27/10/2569 12:21:43" [ref=f1e113]'
          - 'option "[เสริม] #16 load-run-a (mock fixture) · mix · 27/10/2569 12:21:30" [ref=f1e114]'
          - 'option "[หลัก] #15 T22-mock-cold-tts · mix · 27/10/2569 10:24:02" [ref=f1e115]'
          - 'option "[เสริม] #14 load-run-a (mock fixture) · mix · 27/10/2569 10:01:00" [ref=f1e116]'
          - 'option "[เสริม] #13 load-run-a (mock fixture) · mix · 27/10/2569 10:00:38" [ref=f1e117]'
          - 'option "[เสริม] #12 mock-mix-nocache-prefetch48 · mix · 27/10/2569 09:58:34" [ref=f1e118]'
          - 'option "[เสริม] #11 mock-mix-nocache-pruned · mix · 27/10/2569 09:38:15" [ref=f1e119]'
          - 'option "[เสริม] #10 mock-mix-nocache · mix · 26/10/2569 21:40:05" [ref=f1e120]'
          - 'option "[เสริม] #9 load-run-a (mock fixture) · mix · 26/10/2569 13:58:30" [ref=f1e121]'
          - 'option "[เสริม] #8 load-run-a (mock fixture) · mix · 26/10/2569 13:58:13" [ref=f1e122]'
          - 'option "[เสริม] #7 load-run-a (mock fixture) · mix · 26/10/2569 13:23:36" [ref=f1e123]'
          - 'option "[เสริม] #6 load-run-a (mock fixture) · mix · 26/10/2569 13:23:19" [ref=f1e124]'
          - 'option "[เสริม] #5 load-run-a (mock fixture) · mix · 26/10/2569 12:40:57" [ref=f1e125]'
          - 'option "[เสริม] #4 load-run-a (mock fixture) · mix · 26/10/2569 12:40:45" [ref=f1e126]'
          - 'option "[เสริม] #3 mock-mix · mix · 26/10/2569 12:28:46" [ref=f1e127]'
          - 'option "[เสริม] #2 mock-mix-prefetch-only · mix · 26/10/2569 12:06:08" [ref=f1e128]'
          - 'option "[เสริม] #1 mock-mix-baseline · mix · 26/10/2569 11:45:49" [ref=f1e129]'
      - figure "ผสม (แชท + เสียง) · เวลาตอบ (วินาที) ตามจำนวนผู้ใช้พร้อมกัน · ด้านล่าง = คิวยาวสุด" [ref=f1e130]:
        - generic [ref=f1e132]:
          - generic [ref=f1e133]: load-run-a (mock fixture)
          - generic [ref=f1e135]: p50
          - generic [ref=f1e137]: p95
          - generic [ref=f1e139]: TTFT p95
          - generic [ref=f1e141]: คิว chat
          - generic [ref=f1e143]: คิว stt
          - generic [ref=f1e145]: คิว tts
        - img "กราฟเวลาตอบโหมด mix 8 จุด" [ref=f1e147]:
          - generic [ref=f1e149]: "0"
          - generic [ref=f1e151]: "5"
          - generic [ref=f1e153]: "10"
          - generic [ref=f1e155]: "15"
          - generic [ref=f1e157]: "20"
          - generic [ref=f1e159]: วินาที
          - generic [ref=f1e160]: เกณฑ์ p95 12 วิ
          - generic [ref=f1e162]: เป้า 200 คน
          - generic [ref=f1e164]: N = 200
          - generic [ref=f1e166]:
            - generic "load-run-a (mock fixture) · 1 คน · p50 0.80 วิ · error 0.0% · ผ่าน" [ref=f1e168]
            - generic "load-run-a (mock fixture) · 10 คน · p50 1.00 วิ · error 0.0% · ผ่าน" [ref=f1e169]
            - generic "load-run-a (mock fixture) · 25 คน · p50 1.40 วิ · error 0.0% · ผ่าน" [ref=f1e170]
            - generic "load-run-a (mock fixture) · 50 คน · p50 1.80 วิ · error 0.0% · ผ่าน" [ref=f1e171]
            - generic "load-run-a (mock fixture) · 100 คน · p50 2.50 วิ · error 0.0% · ผ่าน" [ref=f1e172]
            - generic "load-run-a (mock fixture) · 150 คน · p50 3.50 วิ · error 0.0% · ผ่าน" [ref=f1e173]
            - generic "load-run-a (mock fixture) · 200 คน · p50 4.80 วิ · error 0.0% · ผ่าน" [ref=f1e174]
            - generic "load-run-a (mock fixture) · 250 คน · p50 7.80 วิ · error 3.0% · ไม่ผ่าน" [ref=f1e175]
            - generic [ref=f1e176]: p50
          - generic [ref=f1e177]:
            - generic "load-run-a (mock fixture) · 1 คน · p95 1.20 วิ · error 0.0% · ผ่าน" [ref=f1e179]
            - generic "load-run-a (mock fixture) · 10 คน · p95 1.80 วิ · error 0.0% · ผ่าน" [ref=f1e180]
            - generic "load-run-a (mock fixture) · 25 คน · p95 2.50 วิ · error 0.0% · ผ่าน" [ref=f1e181]
            - generic "load-run-a (mock fixture) · 50 คน · p95 3.20 วิ · error 0.0% · ผ่าน" [ref=f1e182]
            - generic "load-run-a (mock fixture) · 100 คน · p95 4.80 วิ · error 0.0% · ผ่าน" [ref=f1e183]
            - generic "load-run-a (mock fixture) · 150 คน · p95 7.00 วิ · error 0.0% · ผ่าน" [ref=f1e184]
            - generic "load-run-a (mock fixture) · 200 คน · p95 11.00 วิ · error 0.0% · ผ่าน" [ref=f1e185]
            - generic "load-run-a (mock fixture) · 250 คน · p95 16.00 วิ · error 3.0% · ไม่ผ่าน" [ref=f1e186]
            - generic [ref=f1e187]: p95
          - generic [ref=f1e188]: TTFT p95
          - generic [ref=f1e191]: "50"
          - generic [ref=f1e192]: "0"
          - generic [ref=f1e193]: คิวยาวสุด
          - generic [ref=f1e194]:
            - generic "10 คน · คิว chat ยาวสุด 5" [ref=f1e195]
            - generic "10 คน · คิว stt ยาวสุด 2" [ref=f1e196]
            - generic "10 คน · คิว tts ยาวสุด 3" [ref=f1e197]
          - generic [ref=f1e198]:
            - generic "25 คน · คิว chat ยาวสุด 10" [ref=f1e199]
            - generic "25 คน · คิว stt ยาวสุด 4" [ref=f1e200]
            - generic "25 คน · คิว tts ยาวสุด 6" [ref=f1e201]
          - generic [ref=f1e202]:
            - generic "50 คน · คิว chat ยาวสุด 15" [ref=f1e203]
            - generic "50 คน · คิว stt ยาวสุด 6" [ref=f1e204]
            - generic "50 คน · คิว tts ยาวสุด 9" [ref=f1e205]
          - generic [ref=f1e206]:
            - generic "100 คน · คิว chat ยาวสุด 20" [ref=f1e207]
            - generic "100 คน · คิว stt ยาวสุด 8" [ref=f1e208]
            - generic "100 คน · คิว tts ยาวสุด 12" [ref=f1e209]
          - generic [ref=f1e210]:
            - generic "150 คน · คิว chat ยาวสุด 25" [ref=f1e211]
            - generic "150 คน · คิว stt ยาวสุด 10" [ref=f1e212]
            - generic "150 คน · คิว tts ยาวสุด 15" [ref=f1e213]
          - generic [ref=f1e214]:
            - generic "200 คน · คิว chat ยาวสุด 30" [ref=f1e215]
            - generic "200 คน · คิว stt ยาวสุด 12" [ref=f1e216]
            - generic "200 คน · คิว tts ยาวสุด 18" [ref=f1e217]
          - generic [ref=f1e218]:
            - generic "250 คน · คิว chat ยาวสุด 35" [ref=f1e219]
            - generic "250 คน · คิว stt ยาวสุด 14" [ref=f1e220]
            - generic "250 คน · คิว tts ยาวสุด 21" [ref=f1e221]
          - generic [ref=f1e222]: "1"
          - generic [ref=f1e223]: "10"
          - generic [ref=f1e224]: "25"
          - generic [ref=f1e225]: "50"
          - generic [ref=f1e226]: "100"
          - generic [ref=f1e227]: "150"
          - generic [ref=f1e228]: "200"
          - generic [ref=f1e229]: 250 ✗
          - generic [ref=f1e230]: ผู้ใช้พร้อมกัน (คน)
      - table [ref=f1e232]:
        - caption [ref=f1e233]: load-run-a (mock fixture) · ผสม (แชท + เสียง) · ผลต่อขั้น
        - rowgroup [ref=f1e234]:
          - row [ref=f1e235]:
            - columnheader "ผู้ใช้" [ref=f1e236]
            - columnheader "n" [ref=f1e237]
            - columnheader "ok" [ref=f1e238]
            - columnheader "error" [ref=f1e239]
            - columnheader "error rate" [ref=f1e240]
            - columnheader "p50 (วิ)" [ref=f1e241]
            - columnheader "p95 (วิ)" [ref=f1e242]
            - columnheader "TTFT p95 (วิ)" [ref=f1e243]
            - columnheader "คิว chat" [ref=f1e244]
            - columnheader "คิว stt" [ref=f1e245]
            - columnheader "คิว tts" [ref=f1e246]
            - columnheader "ผล" [ref=f1e247]
        - rowgroup [ref=f1e248]:
          - row [ref=f1e249]:
            - cell "1" [ref=f1e250]
            - cell "1000" [ref=f1e251]
            - cell "1000" [ref=f1e252]
            - cell "0" [ref=f1e253]
            - cell "0.0%" [ref=f1e254]
            - cell "0.80" [ref=f1e255]
            - cell "1.20" [ref=f1e256]
            - cell "0.40" [ref=f1e257]
            - cell "0" [ref=f1e258]
            - cell "0" [ref=f1e259]
            - cell "0" [ref=f1e260]
            - cell "✓ ผ่าน" [ref=f1e261]
          - row [ref=f1e262]:
            - cell "10" [ref=f1e263]
            - cell "1000" [ref=f1e264]
            - cell "1000" [ref=f1e265]
            - cell "0" [ref=f1e266]
            - cell "0.0%" [ref=f1e267]
            - cell "1.00" [ref=f1e268]
            - cell "1.80" [ref=f1e269]
            - cell "0.50" [ref=f1e270]
            - cell "5" [ref=f1e271]
            - cell "2" [ref=f1e272]
            - cell "3" [ref=f1e273]
            - cell "✓ ผ่าน" [ref=f1e274]
          - row [ref=f1e275]:
            - cell "25" [ref=f1e276]
            - cell "1000" [ref=f1e277]
            - cell "1000" [ref=f1e278]
            - cell "0" [ref=f1e279]
            - cell "0.0%" [ref=f1e280]
            - cell "1.40" [ref=f1e281]
            - cell "2.50" [ref=f1e282]
            - cell "0.65" [ref=f1e283]
            - cell "10" [ref=f1e284]
            - cell "4" [ref=f1e285]
            - cell "6" [ref=f1e286]
            - cell "✓ ผ่าน" [ref=f1e287]
          - row [ref=f1e288]:
            - cell "50" [ref=f1e289]
            - cell "1000" [ref=f1e290]
            - cell "1000" [ref=f1e291]
            - cell "0" [ref=f1e292]
            - cell "0.0%" [ref=f1e293]
            - cell "1.80" [ref=f1e294]
            - cell "3.20" [ref=f1e295]
            - cell "0.80" [ref=f1e296]
            - cell "15" [ref=f1e297]
            - cell "6" [ref=f1e298]
            - cell "9" [ref=f1e299]
            - cell "✓ ผ่าน" [ref=f1e300]
          - row [ref=f1e301]:
            - cell "100" [ref=f1e302]
            - cell "1000" [ref=f1e303]
            - cell "1000" [ref=f1e304]
            - cell "0" [ref=f1e305]
            - cell "0.0%" [ref=f1e306]
            - cell "2.50" [ref=f1e307]
            - cell "4.80" [ref=f1e308]
            - cell "1.10" [ref=f1e309]
            - cell "20" [ref=f1e310]
            - cell "8" [ref=f1e311]
            - cell "12" [ref=f1e312]
            - cell "✓ ผ่าน" [ref=f1e313]
          - row [ref=f1e314]:
            - cell "150" [ref=f1e315]
            - cell "1000" [ref=f1e316]
            - cell "1000" [ref=f1e317]
            - cell "0" [ref=f1e318]
            - cell "0.0%" [ref=f1e319]
            - cell "3.50" [ref=f1e320]
            - cell "7.00" [ref=f1e321]
            - cell "1.60" [ref=f1e322]
            - cell "25" [ref=f1e323]
            - cell "10" [ref=f1e324]
            - cell "15" [ref=f1e325]
            - cell "✓ ผ่าน" [ref=f1e326]
          - row [ref=f1e327]:
            - cell "200" [ref=f1e328]
            - cell "1000" [ref=f1e329]
            - cell "1000" [ref=f1e330]
            - cell "0" [ref=f1e331]
            - cell "0.0%" [ref=f1e332]
            - cell "4.80" [ref=f1e333]
            - cell "11.00" [ref=f1e334]
            - cell "2.40" [ref=f1e335]
            - cell "30" [ref=f1e336]
            - cell "12" [ref=f1e337]
            - cell "18" [ref=f1e338]
            - cell "✓ ผ่าน" [ref=f1e339]
          - row [ref=f1e340]:
            - cell "250" [ref=f1e341]
            - cell "1000" [ref=f1e342]
            - cell "970" [ref=f1e343]
            - cell "30" [ref=f1e344]
            - cell "3.0%" [ref=f1e345]
            - cell "7.80" [ref=f1e346]
            - cell "16.00" [ref=f1e347]
            - cell "4.80" [ref=f1e348]
            - cell "35" [ref=f1e349]
            - cell "14" [ref=f1e350]
            - cell "21" [ref=f1e351]
            - cell "✗ ไม่ผ่าน" [ref=f1e352]
  - button "💬 คุยกับน้องใส" [ref=f1e354] [cursor=pointer]
  - alert [ref=f1e355]
```

# Test source

```ts
  1  | import { readFileSync } from 'node:fs';
  2  | import { test, expect } from '@playwright/test';
  3  | import { reset, loginUI, hold } from '../lib/helpers';
  4  | 
  5  | const fixture = JSON.parse(readFileSync(new URL('../fixtures/load-run-a.json', import.meta.url), 'utf8'));
  6  | 
  7  | test.beforeEach(async ({ request }) => {
  8  |   await reset(request);
  9  | });
  10 | 
  11 | test('L01 POST load-run-a.json → load-chart 8 points and load-max-users from the file', async ({ page, request }) => {
  12 |   const r = await request.post('/api/admin/load', { data: fixture, headers: { 'x-eval-token': process.env.EVAL_TOKEN || 'ss-eval' } });
  13 |   expect(r.status(), await r.text()).toBe(201);
  14 |   const { run } = await r.json();
  15 |   expect(run.max_users_ok).toEqual(fixture.max_users_ok);
  16 | 
  17 |   await loginUI(page, 'wichai@saisai.test');
  18 |   await page.goto('/admin/load');
  19 |   const select = page.getByTestId('load-run-select');
  20 |   await expect(select.locator(`option[value="${run.id}"]`)).toContainText(fixture.label);
  21 |   await select.selectOption(String(run.id));
  22 | 
  23 |   const selectedRun = page.locator(`.load-run[data-run-id="${run.id}"]`);
  24 |   const scale = page.getByTestId('load-scale-comparison');
  25 |   await expect(scale.getByTestId('load-scale-card')).toHaveCount(3);
  26 |   for (const name of ['scale-base', 'scale-x2', 'scale-x4']) {
  27 |     await expect(scale.locator(`[data-scale="${name}"]`)).toHaveCount(1);
  28 |   }
  29 |   const chart = selectedRun.getByTestId('load-chart');
> 30 |   await expect(chart).toHaveCount(1);
     |                       ^ Error: expect(locator).toHaveCount(expected) failed
  31 |   await expect(chart).toHaveAttribute('data-points', String(fixture.stages.length));
  32 |   await expect(chart).toHaveAttribute('data-points', '8');
  33 |   await expect(chart.locator('[data-series="p95_ms"] circle')).toHaveCount(8);
  34 | 
  35 |   const modes = Object.keys(fixture.max_users_ok);
  36 |   await expect(selectedRun.getByTestId('load-max-users')).toHaveCount(modes.length);
  37 |   for (const mode of modes) {
  38 |     const card = selectedRun.locator(`[data-testid="load-max-users"][data-mode="${mode}"]`);
  39 |     await expect(card).toHaveAttribute('data-value', String(fixture.max_users_ok[mode]));
  40 |     await expect(card).toHaveText(String(fixture.max_users_ok[mode]));
  41 |   }
  42 |   await expect(selectedRun.locator('.load-big').first()).toContainText(`รองรับพร้อมกันได้ ${fixture.max_users_ok.mix} คน`);
  43 |   await expect(selectedRun.getByTestId('load-criteria')).toContainText('p95 ≤ 12 วิ · error ≤ 1%');
  44 |   await expect(selectedRun.getByTestId('load-stage-row')).toHaveCount(8);
  45 |   await chart.scrollIntoViewIfNeeded();
  46 |   await hold(page);
  47 | });
  48 | 
```