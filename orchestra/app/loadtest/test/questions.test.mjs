import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQuestions, QuestionDeck, options } from '../run_load.mjs';

test('rag770 is the default question set and loads 770 unique read-only questions', async () => {
  const o = options([]);
  assert.equal(o.questions, 'rag770'); assert.equal(o.seedValue, 20261026);
  assert.equal(options(['--questions', 'qa', '--seed', '7']).questions, 'qa');
  assert.throws(() => options(['--questions', 'bogus'])); assert.throws(() => options(['--seed', '-1']));
  const qs = await loadQuestions('rag770');
  assert.equal(qs.length, 770); assert.equal(new Set(qs.map(q => q.id)).size, 770);
  assert.ok(qs.some(q => q.lang === 'en') && qs.some(q => q.lang === 'th'));
});

test('deck deals without replacement, is seed-deterministic and counts repeats only after exhaustion', async () => {
  const qs = await loadQuestions('rag770');
  const a = new QuestionDeck(qs, 42), b = new QuestionDeck(qs, 42), c = new QuestionDeck(qs, 43);
  const first = Array.from({ length: 770 }, () => a.next());
  assert.equal(new Set(first.map(q => q.id)).size, 770);
  assert.equal(a.stats().repeats, 0); assert.ok(first.every(q => !q.repeat));
  assert.deepEqual(Array.from({ length: 770 }, () => b.next().id), first.map(q => q.id));
  assert.notDeepEqual(Array.from({ length: 20 }, () => c.next().id), first.slice(0, 20).map(q => q.id));
  const next = a.next();
  assert.equal(next.repeat, true); assert.equal(next.round, 2);
  assert.deepEqual(a.stats(), { served: 771, unique: 770, repeats: 1, rounds: 2 });
});

test('AI unique-only deck never reissues a question after exhaustion', () => {
  const deck = new QuestionDeck([{id:'one'}, {id:'two'}], 42, {uniqueOnly:true});
  assert.notEqual(deck.next().id, deck.next().id);
  assert.throws(() => deck.next(), /QUESTION_POOL_EXHAUSTED/);
  assert.equal(deck.stats().repeats, 0);
  assert.equal(deck.stats().served, 2);
});
