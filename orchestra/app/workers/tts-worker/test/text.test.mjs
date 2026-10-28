// unit: ทำข้อความให้ TTS พูด (ไม่ต้องใช้ infra)
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLang, prepareSpeech, readCode, stripForSpeech, thaiBaht, thaiInt, truncate, MAX_CHARS } from '../text.mjs';

test('฿5.80 → ห้าบาทแปดสิบสตางค์', () => {
  assert.equal(thaiBaht('5.80'), 'ห้าบาทแปดสิบสตางค์');
  assert.match(prepareSpeech('ใบละ ฿5.80 ค่ะ').text, /ใบละ ห้าบาทแปดสิบสตางค์ ค่ะ/);
  assert.match(prepareSpeech('ราคา 5.80 บาท').text, /ห้าบาทแปดสิบสตางค์/);
  assert.doesNotMatch(prepareSpeech('ใบละ ฿5.80 ค่ะ').text, /\d|฿/);
});

test('B-250 → บี สองร้อยห้าสิบ', () => {
  assert.equal(readCode('B-250'), 'บี สองร้อยห้าสิบ');
  assert.match(prepareSpeech('ขวด B-250 สีเขียว').text, /ขวด บี สองร้อยห้าสิบ สีเขียว/);
  assert.equal(readCode('B-100'), 'บี หนึ่งร้อย');
});

test('เงินอื่น ๆ', () => {
  assert.equal(thaiBaht('63,023.00'), 'หกหมื่นสามพันยี่สิบสามบาทถ้วน');
  assert.equal(thaiBaht('0.80'), 'แปดสิบสตางค์');
  assert.equal(thaiBaht('1500'), 'หนึ่งพันห้าร้อยบาท');
  assert.equal(thaiBaht('95,529.60'), 'เก้าหมื่นห้าพันห้าร้อยยี่สิบเก้าบาทหกสิบสตางค์');
  assert.match(prepareSpeech('รวม ฿63,023.00').text, /หกหมื่นสามพันยี่สิบสามบาทถ้วน/);
});

test('รหัสเอกสาร/สินค้าอ่านทีละหลัก', () => {
  assert.equal(readCode('SO-0019'), 'เอส โอ ศูนย์ศูนย์หนึ่งเก้า');
  assert.equal(readCode('QT-0001'), 'คิว ที ศูนย์ศูนย์ศูนย์หนึ่ง');
  assert.equal(readCode('P07'), 'พี ศูนย์เจ็ด');
  assert.match(prepareSpeech('โทร 02-000-0000').text, /ศูนย์สอง ศูนย์ศูนย์ศูนย์ ศูนย์ศูนย์ศูนย์ศูนย์/);
});

test('จำนวนเต็ม', () => {
  assert.equal(thaiInt('21'), 'ยี่สิบเอ็ด');
  assert.equal(thaiInt('101'), 'หนึ่งร้อยเอ็ด');
  assert.equal(thaiInt('10,000'), 'หนึ่งหมื่น');
  assert.equal(thaiInt('200000'), 'สองแสน');
  assert.equal(thaiInt('1500000'), 'หนึ่งล้านห้าแสน');
  assert.equal(thaiInt('0'), 'ศูนย์');
});

test('ตัด emoji/tag/markdown/ป้ายอ้างอิง', () => {
  const s = stripForSpeech('**สวัสดี**ค่ะ 😊 [1] [PRICE]{"model":"B-250"} <think>x</think>\n- ข้อ 1\n📄 SS-CATALOG.pdf · หน้า 3 [ลิงก์](https://x.y)');
  assert.doesNotMatch(s, /\*|😊|\[1\]|PRICE|think|📄|SS-CATALOG|https/);
  assert.match(s, /สวัสดีค่ะ/);
  assert.match(s, /ลิงก์/);
});

test('ภาษาตามตัวอักษร', () => {
  assert.equal(detectLang('ขวด B-250'), 'th');
  assert.equal(detectLang('The minimum is 1,800 bottles.'), 'en');
  assert.equal(detectLang('1,800', 'en'), 'en');
  assert.equal(prepareSpeech('The minimum for B-150 is 1,800 bottles 🙂', 'th').lang, 'en');
  assert.equal(prepareSpeech('Minimum ขั้นต่ำ', 'en').lang, 'th');
  assert.deepEqual(prepareSpeech('Price: ฿5.80', 'en'), { text: 'Price: 5.80 baht', lang: 'en' });
});

test('ยาวไม่เกิน 600 ตัวอักษร', () => {
  const long = 'ขวดแก้วใสใสคุณภาพดี '.repeat(80);
  assert.ok(truncate(long).length <= MAX_CHARS);
  assert.ok(prepareSpeech(long).text.length <= MAX_CHARS);
});
