import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cache-service/worker.js';
import { publicRecord, cacheDescriptor } from '../cache/local.js';
import { DEFAULTS } from '../api/config.js';

const key = 'a'.repeat(64), origin = 'chrome-extension://' + 'a'.repeat(32);
const request = (method, body, extra = {}) => new Request(`https://cache.example/subtitles/${key}`, {
    method, headers: { Origin: origin, 'CF-Connecting-IP': '127.0.0.1', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}),
});
test('community cache requires origin, rate limits and a configured database', async () => {
    const env = { ALLOWED_ORIGINS: origin };
    assert.equal((await worker.fetch(request('GET', null, { Origin: 'https://evil.example' }), env)).status, 403);
    assert.equal((await worker.fetch(request('GET'), env)).status, 503);
    env.DB = {}; env.READ_LIMITER = { limit: async () => ({ success: false }) };
    assert.equal((await worker.fetch(request('GET'), env)).status, 429);
});
test('submitted subtitles are validated and queued for moderation', async () => {
    let bound;
    const env = { ALLOWED_ORIGINS: origin, WRITE_LIMITER: { limit: async () => ({ success: true }) },
        DB: { prepare: sql => ({ bind: (...args) => { bound = args; return { run: async () => ({}) }; } }) } };
    const record = publicRecord({ key, descriptor: cacheDescriptor('abcdefghijk', DEFAULTS), createdAt: '2026-01-01', transcript: { words: [], segments: [{ start: 0, end: 1, text: 'hello' }] } });
    assert.equal((await worker.fetch(request('PUT', record), env)).status, 202);
    assert.equal(bound[0], key);
    assert.equal((await worker.fetch(request('PUT', { ...record, cookies: 'SECRET' }), env)).status, 400);
});
