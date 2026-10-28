#!/usr/bin/env bash
# Exclusive saisai3 runtime proof; emits no credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
docker exec saisai3-db-1 psql -U ss -d saisai -Atc 'SELECT count(*) FROM tts_audio' > RUN/state/tts-db-before.txt
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const base = 'http://localhost:3600';
for (let i = 0; i < 30; i++) {
  try {
    const r = await fetch(base + '/api/tts/status');
    if ((await r.json()).enabled) break;
  } catch {}
  await new Promise(r => setTimeout(r, 1000));
}
const ids = [];
for (let i = 0; i < 3; i++) {
  const r = await fetch(base + '/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hello, this is the cold speech runtime proof.', lang: 'en' }) });
  assert.equal(r.status, 200);
  const out = await r.json(); ids.push(out.audioId);
  const audio = await fetch(base + '/api/tts/' + out.audioId);
  assert.equal(audio.status, 200); assert.equal(audio.headers.get('cache-control'), 'no-store');
  const bytes = Buffer.from(await audio.arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal((await fetch(base + '/api/tts/' + out.audioId)).status, 404);
}
assert.equal(new Set(ids).size, 3);
console.log(JSON.stringify({ requests: 3, uniqueIds: 3, wavDelivered: 3, replay404: 3, cacheControl: 'no-store' }));
JS
docker exec saisai3-db-1 psql -U ss -d saisai -Atc 'SELECT count(*) FROM tts_audio' > RUN/state/tts-db-after.txt
diff RUN/state/tts-db-before.txt RUN/state/tts-db-after.txt
