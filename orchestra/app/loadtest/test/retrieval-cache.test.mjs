import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieve } from '../../workers/chat-worker/lib/retrieve.mjs';

test('candidate cache shares searches, reranks each request, invalidates document changes, isolates DBs and expires', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let reranks = 0, embeds = 0, offset = 0;
  Date.now = () => originalNow() + offset;
  globalThis.fetch = async url => {
    if (url.endsWith('/embed')) { embeds++; await new Promise(r => setTimeout(r, 5)); return Response.json([Array(384).fill(.1)]); }
    if (url.endsWith('/v1/rerank')) { reranks++; return Response.json({ results: [{ index: 0, relevance_score: 1 }] }); }
    throw new Error('Unexpected network call');
  };
  const makeDB = filename => ({
    version: 'v1', filename, searches: 0,
    async query(sql) {
      if (sql.includes('string_agg')) return { rows: [{ version: this.version }] };
      if (sql.includes('AS similarity')) this.searches++;
      return { rows: this.filename ? [{ id: 1, filename: this.filename, page: 1, content: 'synthetic cache fixture' }] : [] };
    },
  });
  try {
    const db = makeDB('a.pdf'), opts = { embedUrl: 'http://fixture', rerankUrl: 'http://fixture', rerank: 'on', candidateCache: 'on' };
    const results = await Promise.all([retrieve(db, 'cache question', opts), retrieve(db, 'cache question', opts)]);
    assert.equal(db.searches, 1, 'concurrent identical questions share one search');
    assert.equal(embeds, 1); assert.equal(reranks, 2, 'reranking is performed per request');
    assert.equal(results[0][0].filename, 'a.pdf');
    await retrieve(db, 'cache question', { ...opts, rerank: 'off' });
    assert.equal(db.searches, 1); assert.equal(reranks, 2);
    db.version = 'v2'; db.filename = 'b.pdf';
    assert.equal((await retrieve(db, 'cache question', opts))[0].filename, 'b.pdf');
    assert.equal(db.searches, 2, 'upload/reingestion version invalidates candidates');
    db.version = 'deleted'; db.filename = null;
    assert.deepEqual(await retrieve(db, 'cache question', opts), []);
    assert.equal(db.searches, 3, 'deletion invalidates candidates');
    const otherDB = makeDB('other.pdf');
    assert.equal((await retrieve(otherDB, 'cache question', opts))[0].filename, 'other.pdf');
    assert.equal(otherDB.searches, 1);
    offset = 300001;
    await retrieve(otherDB, 'cache question', opts);
    assert.equal(otherDB.searches, 2, 'inactive cache entries expire');
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test('embedding outage is not cached after vector service recovers', async () => {
  const originalFetch = globalThis.fetch;
  let embeds = 0, searches = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/embed')) { embeds++; return embeds === 1 ? new Response(null, { status: 503 }) : Response.json([Array(384).fill(.1)]); }
    throw new Error('Unexpected network call');
  };
  const db = { async query(sql) {
    if (sql.includes('string_agg')) return { rows: [{ version: 'v1' }] };
    if (sql.includes('AS similarity')) searches++;
    return { rows: [{ id: 1, filename: 'recovery.pdf', page: 1, content: 'synthetic fixture' }] };
  } };
  try {
    const opts = { embedUrl: 'http://fixture', rerank: 'off', candidateCache: 'on' };
    assert.equal((await retrieve(db, 'recovery', opts)).length, 1);
    assert.equal((await retrieve(db, 'recovery', opts)).length, 1);
    assert.equal(embeds, 2); assert.equal(searches, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('RAG_CANDIDATE_CACHE=off (default) searches the DB and embedder on every call, including concurrent identical queries', async () => {
  const originalFetch = globalThis.fetch, originalEnv = process.env.RAG_CANDIDATE_CACHE;
  let embeds = 0, searches = 0, versions = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/embed')) { embeds++; await new Promise(r => setTimeout(r, 5)); return Response.json([Array(384).fill(.1)]); }
    throw new Error('Unexpected network call');
  };
  const db = { async query(sql) {
    if (sql.includes('string_agg')) { versions++; return { rows: [{ version: 'v1' }] }; }
    if (sql.includes('AS similarity')) searches++;
    return { rows: [{ id: 1, filename: 'nocache.pdf', page: 1, content: 'synthetic fixture' }] };
  } };
  try {
    delete process.env.RAG_CANDIDATE_CACHE; // compose default = off
    const opts = { embedUrl: 'http://fixture', rerank: 'off' };
    await Promise.all([retrieve(db, 'same question', opts), retrieve(db, 'same question', opts)]);
    await retrieve(db, 'same question', opts);
    assert.equal(searches, 3, 'no singleflight and no reuse when off');
    assert.equal(embeds, 3);
    process.env.RAG_CANDIDATE_CACHE = 'off';
    await retrieve(db, 'same question', opts);
    assert.equal(searches, 4); assert.equal(embeds, 4);
    assert.equal(versions, 0, 'off never touches the cache version lookup');
    process.env.RAG_CANDIDATE_CACHE = 'on';
    await retrieve(db, 'env on question', opts); await retrieve(db, 'env on question', opts);
    assert.equal(searches, 5, 'env on enables reuse');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.RAG_CANDIDATE_CACHE; else process.env.RAG_CANDIDATE_CACHE = originalEnv;
  }
});
