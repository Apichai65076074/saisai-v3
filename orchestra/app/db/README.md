# db/ — schema + seed ของ SaiSai v3 (T04) · **สัญญากลาง: งานอื่นอ่านไฟล์นี้**

| ไฟล์ | คืออะไร |
|---|---|
| `init/001_schema.sql` | `CREATE EXTENSION vector, pg_trgm` + ตารางธุรกิจ (โครงตาม legacy `01-schema.sql` + `04` + `05`) + ตารางใหม่ v3 + ฟังก์ชัน `next_doc_no` `app_now` `app_today` |
| `init/002_seed.sql` | ฟังก์ชัน `reset_test_data(p_now)` (INSERT คัดลอกตรงตัวจาก legacy `02-seed.sql` ทุกแถว) + เรียกครั้งแรกด้วย `2026-10-11T10:00:00+07:00` |
| `init/5NN-<TID>-*.sql` | migration ของงานอื่น (T07=510 T08=520 T09=530 T10=540 T12=550 T13=560 T15=570 T17=580 T19=590) · ต้อง idempotent (`IF NOT EXISTS`) |
| `apply.mjs` | `node db/apply.mjs [--reset]` รัน `init/*.sql` ตามลำดับชื่อกับ `$DATABASE_URL` (`--reset` = `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` ก่อน) · ใช้ `pg` จาก `web/node_modules` |
| `Dockerfile` | `FROM pgvector/pgvector:pg16` + COPY `init/*.sql` → `/docker-entrypoint-initdb.d/` (รันครั้งเดียวตอน volume `pgdata` ว่าง) |

```bash
cd web && npm install && cd ..
DATABASE_URL=postgres://dev:dev@127.0.0.1:56432/t_<งาน> node db/apply.mjs --reset
```

## กติกา
- เงินทุกช่องเป็น `NUMERIC` → `pg` คืนเป็น **สตริง** (`"5.20"`) ส่งให้ `quote()` / `decimal.js` ได้ตรง ๆ · ห้ามแปลงเป็น number
- `web/lib/db.ts` ตั้ง parser: `DATE` → สตริง `'YYYY-MM-DD'` · `BIGINT` (id) → number · `TIMESTAMPTZ` → `Date` · connection ตั้ง `timezone=Asia/Bangkok` (worker ที่สร้าง pool เองควรทำแบบเดียวกัน)
- id ของ seed คงที่ (บริษัท 1–5 · ผู้ใช้ 1–8 · สินค้า 1–9 · ออเดอร์ 1–18 …) และ identity ต่อจากค่าสูงสุด
- **เวลา "วันนี้"** = `app_settings` key `'now'` (ISO `+07:00`) · ไม่มีแถว = เวลาจริง · SQL: `SELECT app_now()` / `SELECT app_today()` หรือ `CLOCK_SQL` ใน `web/lib/clock.ts` · **ห้ามใช้ `now()` ของ Postgres ตรง ๆ** กับกฎธุรกิจ (คอลัมน์ `created_at DEFAULT now()` ของตารางใหม่เป็นเวลาจริงได้ แต่ข้อมูลธุรกิจ เช่น `orders.created_at` `order_status_history.changed_at` ควรใส่ `app_now()`)
- **เลขเอกสาร**: `SELECT next_doc_no('SO'|'CL'|'SR'|'QT')` → `'SO-0019'` (atomic · `UPDATE … RETURNING` ใน transaction เดียวกับ INSERT ได้) · prefix ใหม่ถูกสร้างอัตโนมัติ
- **ห้ามใส่ข้อมูลจาก PDF ลง DB/seed** (ข้อมูลเอกสารมาจาก RAG เท่านั้น)
- ตารางประวัติ `order_status_history` `claim_status_history` `payments` `order_pickup_change` = เพิ่มได้อย่างเดียว (trigger ห้าม UPDATE/DELETE)

## reset (`POST /api/test/reset {now?}` → `SELECT reset_test_data($1)`)
- ล้าง (`TRUNCATE … RESTART IDENTITY CASCADE`) แล้ว seed ใหม่: ตารางธุรกิจทั้งหมด + `factory_holiday` (3 วัน) + `doc_counters` (SO 18 · CL 4 · SR 3 · QT 0) + `shop_settings`
- ล้างทิ้ง (ไม่มี seed): `quotes` `notifications` `chat_sessions` `chat_messages` `tts_audio` · ตารางอื่นที่มี FK ไปตารางธุรกิจถูกล้างด้วย (CASCADE)
- **ไม่ลบ**: `docs` `doc_chunks` `eval_runs` `load_runs` · `app_settings` key อื่นนอกจาก `'now'`
- ตั้ง `app_settings.now` = `p_now` (NULL = ลบแถว → เวลาจริง) · คืน JSON จำนวนแถวต่อตาราง
- **hook ของงานอื่น**: ถ้ามีตารางใหม่ที่ต้องล้าง/seed ตอน reset ให้สร้างใน migration ของตัวเอง
  `CREATE OR REPLACE FUNCTION reset_hook_<tid>_<ชื่อ>() RETURNS void LANGUAGE sql AS $$ TRUNCATE my_table $$;` → ถูกเรียกท้าย reset ตามลำดับชื่อ (ไม่ต้องแก้ไฟล์ T04)
- เปลี่ยนแค่เวลาโดยไม่ล้างข้อมูล: `POST /api/test/clock {now}` (`{now:'real'}` = เวลาจริง)

## จำนวนแถว seed (เท่ากับ legacy `02-seed.sql` ทุกตาราง)
| ตาราง | แถว | หมายเหตุ |
|---|---|---|
| companies | 5 | C01–C05 |
| users | 8 | U01–U08 |
| delivery_addresses | 10 | ADDR-01..10 (C01 = ADDR-01..04 · 160/49/50/51 กม.) |
| product_models | 4 | B-100 B-150 B-250 B-500 |
| products | 9 | P01–P09 |
| orders | 18 | SO-0001..SO-0018 |
| order_status_history | 88 | |
| payments | 11 | |
| claims | 4 | CL-0001..CL-0004 |
| claim_status_history | 9 | |
| claim_photos | 7 | รูปจริง bytea (JPG/PNG) |
| sample_requests | 3 | SR-0001..SR-0003 |
| sample_request_items | 4 | |
| factory_holiday | 3 | 2026-10-23 · 2026-12-05 · 2026-12-31 |
| order_pickup_change | 0 | |
| doc_counters | 4 | SO 18 · CL 4 · SR 3 · QT 0 |
| shop_settings | 1 | |
| app_settings | 1 | now = 2026-10-11T10:00:00+07:00 |

## ตารางธุรกิจ (ชื่อ/คอลัมน์ตาม legacy)

### `companies` — บริษัทลูกค้า
| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| id | bigint pk | 1–5 |
| code | text unique | `C01`… |
| name / name_en | text | ชื่อไทย / อังกฤษ (C03 = Tanaka Trading Co., Ltd. ทั้งคู่) |
| contact_phone | text null | |
| created_at | timestamptz | |

### `users` — ผู้ใช้ทุกบทบาท
| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| id | bigint pk | 1–8 (U01–U08) |
| code | text unique | `U01` |
| email | text unique | `arun@saisai.test` … (รหัสผ่านทดสอบ: legacy `web/SPEC.md` ข้อ 6) |
| password_hash | text | bcrypt `$2a$10$…` (ตรวจด้วย `bcryptjs`) |
| display_name / display_name_en | text | |
| role | text | `customer` `staff` `owner` · CHECK customer ⇔ มี company_id |
| company_id | bigint null → companies | null สำหรับ staff/owner |
| preferred_lang | text | `th` / `en` (U04 kenji = en) |

### `delivery_addresses` — ที่อยู่ส่งของ (legacy ใช้ชื่อนี้ ไม่ใช่ `addresses`)
| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| id | bigint pk | 1–10 |
| code | text unique | `ADDR-01` … · input ราคาใช้ `addressCode` |
| company_id | bigint → companies | ที่อยู่ต้องเป็นของบริษัทตัวเอง |
| label / label_en | text | ชื่อสั้น เช่น "โรงงานนครสวรรค์ (ที่อยู่หลัก)" |
| address_text / address_text_en | text | ที่อยู่เต็ม |
| distance_km | int ≥ 0 | ไม่มี CHECK ≤ 300 (ADDR-10 = 301) |
| is_primary | boolean | ที่อยู่หลักของบริษัท |

### `product_models` — รุ่น
| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| code | text pk | `B-100` `B-150` `B-250` `B-500` |
| size_ml | smallint | 100 150 250 500 |
| min_qty | int | 2400 1800 1200 800 (ตรงกับ `MODELS` ใน rules.ts) |

### `products` — สินค้า 9 แบบ
| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| id | bigint pk | 1–9 |
| code | text unique | `P01`–`P09` |
| model_code | text → product_models | `B-250` |
| color | text | `clear` `amber` `green` (ไทย: ใส ชา เขียว) |
| unit_price | numeric(10,2) | ราคา/ใบ (`"5.80"`) → `quote()` ctx.unitPrice |
| image_path | text | `/assets/bottle-b250-green.png` |
| slug | text (generated) | **ใหม่ v3** `b250-green` = lower(model ไม่มี -) + '-' + color |
| | | UNIQUE (model_code, color) |

### `orders` — ออเดอร์ (snapshot เงินทุกบรรทัดตอนยืนยัน)
| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| id | bigint pk | |
| order_no | text unique | `SO-0001` (ใหม่ใช้ `next_doc_no('SO')`) |
| company_id / created_by | bigint | บริษัท / ผู้สั่ง (users.id) |
| product_id | bigint → products | |
| address_id | bigint null → delivery_addresses | |
| reorder_of | bigint null → orders | สั่งซ้ำจากออเดอร์ไหน |
| quantity | int | 1–200000 ทีละ 100 · trigger ตรวจขั้นต่ำต่อรุ่น |
| unit_price, logo_unit_price | numeric(10,2) | ราคาตอนสั่ง |
| logo | boolean | CHECK โลโก้ ⇒ quantity ≥ 5000 |
| distance_km | int 0–300 | |
| trips | smallint ≥ 1 | ⌈qty/20000⌉ (เก็บแม้ส่งฟรี) |
| bottles_amount, discount_amount, logo_amount, shipping_amount, subtotal_amount, vat_amount, total_amount | numeric(12,2) | บรรทัดเงินจาก `quote().lines` · CHECK subtotal = bottles − discount + logo + shipping · total = subtotal + vat |
| discount_rate | numeric(5,4) | 0 / 0.03 / 0.05 / 0.07 / 0.10 |
| pickup_date | date | วันรับของ |
| payment_terms | text | `prepay` / `credit30` |
| status | smallint 1–6 | 1 รับออเดอร์ 2 ยืนยันสเปก 3 กำลังผลิต 4 ตรวจคุณภาพ 5 พร้อมจัดส่ง 6 จัดส่งแล้ว |
| shipped_at | timestamptz null | ⇔ status 6 |
| due_date | date null | เฉพาะ credit30 (วันจัดส่ง + 30) |
| note | text null | |
| created_at | timestamptz | เวลายืนยัน (ใส่ `app_now()`) |

### `order_status_history` — ประวัติสถานะ (append-only)
`id` · `order_id` → orders · `from_status` (null = แถวแรก) · `to_status` (= from + 1) · `changed_by` → users · `changed_at` · `reason`

### `payments` — บันทึกรับเงิน (append-only · 1 ต่อออเดอร์)
`id` · `order_id` unique → orders · `amount` numeric(12,2) (= ยอดรวม) · `recorded_by` → users · `recorded_at`

### `order_pickup_change` — ประวัติเลื่อนวันรับของ (CR-01 · append-only)
`id` · `order_no` → orders(order_no) · `from_date` · `to_date` (≠ from) · `changed_by` → users · `changed_at`

### `claims` — เคลม
| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| id | bigint pk | |
| claim_no | text unique | `CL-0001` |
| order_id / company_id / reported_by | bigint | |
| lot_no | text | `LOT-` + 6 หลัก |
| quantity | int ≥ 1 | |
| description | text | |
| status | text | `received` `reviewing` `approved` `rejected` |
| reject_reason | text null | บังคับเมื่อ rejected (1–1000 ตัว) |
| created_at | timestamptz | |

### `claim_photos` — รูปเคลม (legacy ใช้ชื่อนี้ ไม่ใช่ `claim_images`)
`id` · `claim_id` → claims · `seq` 1–5 (unique ต่อเคลม) · `file_name` · `mime_type` (`image/jpeg`/`image/png`) · `size_bytes` (≤ 5 MB) · `content` bytea

### `claim_status_history` — ประวัติสถานะเคลม (append-only)
`id` · `claim_id` · `from_status` · `to_status` (null→received → reviewing → approved/rejected) · `changed_by` · `changed_at` · `reason`

### `sample_requests` / `sample_request_items` — ขอขวดตัวอย่าง
- `sample_requests`: `id` · `request_no` `SR-0001` · `company_id` · `requested_by` · `request_date` date (นับโควตาต่อเดือนปฏิทิน) · `total_amount` (= 0 เสมอ) · `note` · `created_at`
- `sample_request_items`: `id` · `sample_request_id` → sample_requests · `product_id` → products · `quantity` 1–3

### `factory_holiday` — วันหยุดโรงงาน (legacy ใช้ชื่อนี้ ไม่ใช่ `holidays`)
`holiday_date` date pk · `name_th` · `name_en` (≤ 100 ตัว) · ส่งเข้า `quote()` เป็น `holidays: [{date, nameTh, nameEn}]`

### `shop_settings` — ค่าคงที่ร้าน (1 แถว)
`legal_name_th` บจก. ใสใส กลาสแวร์ · `legal_name_en` · `bank_name_th` ธนาคารทดสอบ · `bank_name_en` · `bank_account_no` 000-0-00000-0 · `sales_phone` 02-000-0000 · `sales_line` @saisai-test

### `doc_counters` — ตัวนับเลขเอกสาร
`prefix` text pk (`SO` `CL` `SR` `QT`) · `n` int = เลขล่าสุดที่ออกแล้ว · ใช้ผ่าน `next_doc_no(prefix)` เท่านั้น

### `app_settings` — ค่าระบบ key/value
`key` text pk · `value` text · `'now'` = ISO "วันนี้" ของระบบทดสอบ (`2026-10-11T10:00:00+07:00`)

## ตารางใหม่ v3
| ตาราง | คอลัมน์ | ใช้โดย |
|---|---|---|
| `quotes` | `id` serial · `quote_no` unique (`QT-0001`) · `company_id` · `created_by` · `input` jsonb (`{model,color,quantity,logo,addressCode?\|distanceKm?,pickupDate?}`) · `lines` jsonb (เงินเป็นสตริง 2 ตำแหน่ง) · `valid_until` date · `converted_order_no` text · `created_at` | T08 · chat-worker |
| `docs` | `id` · `filename` unique · `bytes` bytea · `pages` · `chunks` (0) · `status` `queued\|processing\|ready\|failed` · `error` · `created_at` · `updated_at` | T12 |
| `doc_chunks` | `id` · `doc_id` → docs (on delete cascade) · `filename` · `page` · `chunk_index` · `content` · `embedding` vector(384) · `tsv` tsvector · index: gin trgm (`content`) · hnsw (`embedding vector_cosine_ops`) · gin (`tsv`) | T12 · T13 · eval |
| `chat_sessions` | `id` text pk (= cookie `ss_chat`) · `user_id` null · `company_id` null · `lang` (`th`) · `created_at` | T10 |
| `chat_messages` | `id` · `session_id` · `role` `user\|assistant` · `text` · `cites` jsonb `[]` · `via` `text\|voice` · `meta` jsonb `{}` · `created_at` | T10 · T13 |
| `notifications` | `id` · `type` `order.created\|claim.created\|quote.created` · `no` · `message` · `read` (false) · `created_at` | T09 |
| `tts_audio` | `audio_id` text pk · `wav` bytea · `duration_ms` · `engine` · `lang` · `created_at` | T15 |
| `eval_runs` | `id` · `label` · `created_at` · `config` · `summary` · `items` (jsonb) | T17 · T18 |
| `load_runs` | `id` · `label` · `created_at` · `config` · `stages` jsonb · `max_users_ok` int | T19 · T20 |

## ฟังก์ชัน
| ฟังก์ชัน | คืน | หมายเหตุ |
|---|---|---|
| `next_doc_no(prefix text)` | text `'QT-0001'` | atomic · ต่อจาก seed |
| `app_now()` | timestamptz | `app_settings.now` หรือ `now()` |
| `app_today()` | date | วันที่เวลาไทยของ `app_now()` |
| `reset_test_data(p_now timestamptz)` | jsonb จำนวนแถว | ดูหัวข้อ reset |

## ต่างจาก legacy (ตั้งใจ)
- ไม่มี role `saisai_app` / GRANT (เว็บต่อด้วย user ของ DATABASE_URL ตรง) · ไม่มีตาราง `sessions` (session = cookie HMAC `ss_session`)
- `app_clock(fixed_now)` → `app_settings('now')` · `doc_counters.last_no` → `doc_counters.n` (+ QT) · `next_doc_no` ไม่ต้องมีแถว prefix ล่วงหน้า
- `reset_test_data` รวม `reset_test_holidays()` (คืนวันหยุด 3 วัน) ไว้ในตัว · ปิด trigger ของ `order_pickup_change` ด้วย
- `products.slug` (generated) เพิ่มใหม่
