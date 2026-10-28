/** Hybrid e5 cosine + pg_trgm, RRF top20, optional rerank top4. No document facts here. */
// Cache only RRF candidates; reranking/generation always run. Per-DB isolation and
// ready-document versions invalidate uploads/deletes/re-ingestion immediately.
const candidateCaches = new WeakMap();
const CANDIDATE_CACHE_LIMIT = 256, CANDIDATE_CACHE_TTL_MS = 300000;
// T24: the cache is opt-in (RAG_CANDIDATE_CACHE=on). Off = no read, no write, no singleflight.
export const candidateCacheStats = { mode: null, hits: 0, misses: 0, bypass: 0 };
export const candidateCacheMode = options => ((options.candidateCache ?? process.env.RAG_CANDIDATE_CACHE ?? 'off') === 'on' ? 'on' : 'off');
export function rrf(...lists) {
  const merged = new Map();
  for (const list of lists) list.forEach((row, index) => {
    const key = String(row.id);
    const item = merged.get(key) || { ...row, score: 0 };
    item.score += 1 / (60 + index + 1);
    merged.set(key, item);
  });
  return [...merged.values()].sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id)).slice(0, 20);
}
export const rerankStats = { requests: 0, succeeded: 0, fallback: 0 };
export async function rerank(query, candidates, options = {}) {
  if ((options.rerank ?? process.env.RERANK ?? 'on') === 'off' || !candidates.length) return candidates.slice(0, 4);
  rerankStats.requests++;
  try {
    const base = (options.rerankUrl ?? process.env.RERANK_URL ?? 'http://mock-llm:8000').replace(/\/$/, '');
    const res = await (options.fetch ?? fetch)(`${base.replace(/\/v1$/, '')}/v1/rerank`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.AIBOX_API_KEY || 'mock'}` },
      body: JSON.stringify({ query, documents: candidates.map(c => c.content) }), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('rerank HTTP');
    const data = await res.json();
    const rows = data.results ?? data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('rerank format');
    const seen = new Set();
    const ranked = [...rows].sort((a, b) => (b.relevance_score ?? b.score) - (a.relevance_score ?? a.score));
    const out = [];
    for (const r of ranked) {
      if (!Number.isInteger(r.index) || !candidates[r.index] || seen.has(r.index) || !Number.isFinite(r.relevance_score ?? r.score)) throw new Error('rerank invalid');
      seen.add(r.index);
      out.push({ ...candidates[r.index], score: r.relevance_score ?? r.score });
    }
    rerankStats.succeeded++;
    return [...out, ...candidates.filter((_, i) => !seen.has(i))].slice(0, 4);
  } catch { rerankStats.fallback++; return candidates.slice(0, 4); }
  finally { console.log(`[rerank] ${JSON.stringify(rerankStats)}`); }
}
const KEYWORD_SQL = `SELECT c.id,c.filename,c.page,c.content,
    (SELECT avg(word_similarity(t,c.content)) + 4 * avg(word_similarity(t,split_part(c.content,']',1))) FROM unnest($1::text[]) t) AS similarity
    FROM doc_chunks c JOIN docs d ON d.id=c.doc_id AND d.status='ready'`;
/** Original weighted trigram ranking: scores every ready chunk (T13). */
export const keywordFullScan = (db, terms) => db.query(`${KEYWORD_SQL} ORDER BY similarity DESC,c.id LIMIT 20`, [terms]);
// T24: exact top-20 with pruning (not a cache). word_similarity(t, x) <= |trgm(t) ∩ trgm(x)| / |trgm(t)|, so
// bound = Σ that ratio for the body + 4 × for the heading (doc_chunk_trgms, written by trigger from content). Chunks are
// scored with the unchanged KEYWORD_SQL, best bound first, until no unscored chunk can reach the 20th exact score.
const BOUND_SQL = `WITH tt AS (SELECT u.ord, g FROM unnest($1::text[]) WITH ORDINALITY u(t, ord), unnest(show_trgm(u.t)) g),
  tl AS (SELECT ord, count(*)::float8 n FROM tt GROUP BY ord),
  hits AS (SELECT x.chunk_id, x.part, tt.ord, count(*)::float8 k FROM tt JOIN doc_chunk_trgms x ON x.trgm = tt.g GROUP BY 1, 2, 3),
  bound AS (SELECT h.chunk_id, sum(h.k / tl.n * CASE h.part WHEN 1 THEN 4 ELSE 1 END) / cardinality($1::text[]) ub FROM hits h JOIN tl USING (ord) GROUP BY 1)
  SELECT c.id, coalesce(b.ub, 0) AS bound
  FROM doc_chunks c JOIN docs d ON d.id=c.doc_id AND d.status='ready' LEFT JOIN bound b ON b.chunk_id = c.id`;
const BOUND_EPS = 1e-6, PRUNE_BATCH = 24;
const byScore = (a, b) => b.similarity - a.similarity || Number(a.id) - Number(b.id);
export async function keywordPruned(db, terms) {
  const bounds = (await db.query(BOUND_SQL, [terms])).rows.map(r => ({ id: Number(r.id), bound: Number(r.bound) }))
    .sort((a, b) => b.bound - a.bound || a.id - b.id);
  const scored = [];
  let next = 0, scoredQueries = 0;
  while (next < bounds.length) {
    const top = scored.length >= 20 ? scored[19].similarity : -Infinity;
    if (bounds[next].bound < top - BOUND_EPS) break; // remaining chunks cannot enter the top 20
    const ids = [];
    while (next < bounds.length && ids.length < PRUNE_BATCH && bounds[next].bound >= top - BOUND_EPS) ids.push(bounds[next++].id);
    scored.push(...(await db.query(`${KEYWORD_SQL} WHERE c.id = ANY($2::int[])`, [terms, ids])).rows);
    scored.sort(byScore); scoredQueries++;
  }
  return { rows: scored.slice(0, 20), pruning: { chunks: bounds.length, scored: Math.min(next, bounds.length), queries: scoredQueries } };
}
const prunedAvailable = new WeakMap(); // db → {ok, at, pending}; missing table (old DB without migration 595) → full scan, re-probe each minute
async function keywordSearch(db, terms, options) {
  if ((options.keyword ?? process.env.RAG_KEYWORD ?? 'pruned') === 'fullscan') return keywordFullScan(db, terms);
  let probe = prunedAvailable.get(db);
  if (!probe || (!probe.ok && !probe.pending && Date.now() - probe.at > 60000)) {
    const previous = probe?.ok;
    const pending = db.query(`SELECT to_regclass('doc_chunk_trgms') IS NOT NULL AS ok`).then(r => {
      const ok = !!r.rows[0]?.ok;
      if (previous !== ok) console.log(`[retrieve] keyword search = ${ok ? 'pruned (doc_chunk_trgms)' : 'fullscan (doc_chunk_trgms missing)'}`);
      prunedAvailable.set(db, { ok, at: Date.now() });
      return ok;
    }, () => { prunedAvailable.set(db, { ok: false, at: Date.now() }); return false; });
    prunedAvailable.set(db, probe = { ok: previous ?? false, at: Date.now(), pending });
  }
  return (probe.pending ? await probe.pending : probe.ok) ? keywordPruned(db, terms) : keywordFullScan(db, terms);
}
export function searchTerms(query) {
  // Thai has no spaces: segment search terms and weight section headings as well as body.
  // Keep hyphenated identifiers whole so trigrams still distinguish model/lot/product codes.
  // Price/product lookup is handled by SQL; retrieve the document clause of a mixed question.
  const clauses = query.split(/\s*(?:แล้ว|และ|\band\b|\bthen\b)\s*/i);
  if (clauses.length > 1 && /ใบละ|ราคา|price/i.test(clauses[0]) && clauses.at(-1).trim()) query = clauses.at(-1).trim();
  const stop = new Set(['ขวด', 'ต้อง', 'กี่', 'ใช้', 'ได้', 'ไหม', 'มี', 'อะไร', 'เท่าไร', 'ค่ะ', 'ครับ', 'the', 'is', 'a', 'what', 'how']);
  const terms = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(query.toLowerCase())]
    .filter(t => t.isWordLike && !stop.has(t.segment)).map(t => t.segment);
  terms.push(...(query.match(/\b(?:B-\d+|P\d+|LOT-[\w-]+)/gi) ?? []));
  if (!terms.length) terms.push(query);
  return { query, terms };
}
export async function retrieve(db, query, options = {}) {
  const originalQuery = query;
  let terms;
  ({ query, terms } = searchTerms(query));
  let candidateCache, candidateKey;
  const cacheMode = candidateCacheMode(options);
  if (candidateCacheStats.mode !== cacheMode) { candidateCacheStats.mode = cacheMode; console.log(`[retrieve] RAG_CANDIDATE_CACHE=${cacheMode}`); }
  if (cacheMode === 'off' || options.fetch) candidateCacheStats.bypass++;
  else { // injected transports remain uncached for eval/tests
    const version = (await db.query(`SELECT coalesce(string_agg(id::text || ':' || updated_at::text, ',' ORDER BY id),'') AS version FROM docs WHERE status='ready'`)).rows[0].version;
    candidateCache = candidateCaches.get(db);
    if (!candidateCache) { candidateCache = new Map(); candidateCaches.set(db, candidateCache); }
    candidateKey = JSON.stringify([version, query, options.embedUrl ?? process.env.EMBED_URL ?? 'http://embedder:80']);
    const hit = candidateCache.get(candidateKey);
    if (hit && hit.expiresAt > Date.now()) {
      if (++candidateCacheStats.hits % 100 === 1) console.log(`[retrieve] candidate cache hits=${candidateCacheStats.hits} misses=${candidateCacheStats.misses}`);
      hit.expiresAt = Date.now() + CANDIDATE_CACHE_TTL_MS;
      candidateCache.delete(candidateKey); candidateCache.set(candidateKey, hit);
      return rerank(originalQuery, structuredClone(hit.rows ?? await hit.promise), options);
    }
    candidateCache.delete(candidateKey);
    candidateCacheStats.misses++;
  }
  const keyword = keywordSearch(db, terms, options);
  const vector = (async () => {
    try {
      const res = await (options.fetch ?? fetch)(`${(options.embedUrl ?? process.env.EMBED_URL ?? 'http://embedder:80').replace(/\/$/, '')}/embed`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputs: [`query: ${query}`] }), signal: options.signal ?? AbortSignal.timeout(600000),
      });
      if (!res.ok) throw new Error('embed HTTP');
      const [v] = await res.json();
      if (!Array.isArray(v) || v.length !== 384 || !v.every(Number.isFinite)) throw new Error('embed dimension');
      return (await db.query(`SELECT c.id,c.filename,c.page,c.content FROM doc_chunks c
        JOIN docs d ON d.id=c.doc_id AND d.status='ready' WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector,c.id LIMIT 20`, [JSON.stringify(v)])).rows;
    } catch { return []; } // lexical retrieval still works when TEI is unavailable
  })();
  if (candidateCache) {
    const pending = Promise.all([vector, keyword]).then(([v, k]) => rrf(v, k.rows));
    candidateCache.set(candidateKey, { expiresAt: Date.now() + CANDIDATE_CACHE_TTL_MS, promise: pending });
    pending.catch(() => { if (candidateCache.get(candidateKey)?.promise === pending) candidateCache.delete(candidateKey); });
    while (candidateCache.size > CANDIDATE_CACHE_LIMIT) candidateCache.delete(candidateCache.keys().next().value);
  }
  const [v, k] = await Promise.all([vector, keyword]);
  if (candidateCache) {
    if (v.length) candidateCache.set(candidateKey, { expiresAt: Date.now() + CANDIDATE_CACHE_TTL_MS, rows: rrf(v, k.rows) });
    else candidateCache.delete(candidateKey); // retry vector retrieval after an embedder outage
    while (candidateCache.size > CANDIDATE_CACHE_LIMIT) candidateCache.delete(candidateCache.keys().next().value);
  }
  return rerank(originalQuery, rrf(v, k.rows), options);
}
export default retrieve;
