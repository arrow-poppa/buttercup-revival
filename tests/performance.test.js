import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateSettings } from '../api/config.js';
import { processVideo } from '../api/transcription.js';

const configured = extra => ({ ...DEFAULTS, provider: 'deepinfra', deepinfraApiKey: 'ONLY_DEEP_KEY',
    apiKey: 'PRIVATE_ROUTER_KEY', backendToken: 'ONLY_LOCAL_TOKEN', cache: false, ...extra });

test('whole audio requires capability and one confirmed full file, then makes exactly one provider request', async t => {
    const calls = []; let capable = true, confirmed = true;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push(url);
        if (url.endsWith('/health')) return Response.json({ audio_modes: capable ? ['chunks', 'whole'] : ['chunks'] });
        if (url.endsWith('/jobs/extract')) {
            assert.deepEqual(JSON.parse(options.body), { video: 'abcdefghijk', chunk_seconds: 120, max_upload_bytes: 24000000, audio_mode: 'whole' });
            return Response.json({ id: 'whole', state: 'ready', audio_mode: confirmed ? 'whole' : 'chunks',
                chunks: [{ index: 0, offset: 0, duration: 509.321, size: 4074893 }] });
        }
        if (options.method === 'DELETE') return Response.json({ deleted: true });
        if (url.includes('/chunks/')) return new Response(new Blob(['whole video audio']));
        assert.equal(url, 'https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo');
        assert.equal(await options.body.get('audio').text(), 'whole video audio');
        assert.deepEqual(options.headers, { Authorization: 'Bearer ONLY_DEEP_KEY' });
        return Response.json({ segments: [{ start: .1, end: 1, text: 'opening' }, { start: 508, end: 509, text: 'ending' }] });
    });
    const result = await processVideo('abcdefghijk', configured({ audioMode: 'whole', parallelRequests: 3 }), new AbortController().signal, () => {});
    assert.equal(result.segments[0].start, .1); assert.equal(result.segments.at(-1).end, 509);
    assert.equal(calls.filter(url => url.startsWith('https:')).length, 1);
    calls.length = 0; capable = false;
    await assert.rejects(processVideo('abcdefghijk', configured({ audioMode: 'whole' }), new AbortController().signal, () => {}), /Restart.*whole-audio/);
    assert.equal(calls.length, 1);
    calls.length = 0; capable = true; confirmed = false;
    await assert.rejects(processVideo('abcdefghijk', configured({ audioMode: 'whole' }), new AbortController().signal, () => {}), /did not confirm a whole-audio/);
    assert.equal(calls.filter(url => url.startsWith('https:')).length, 0);
    assert.ok(calls.at(-1).endsWith('/jobs/whole'));
});

test('parallel requests are bounded, keep provider pinning and preserve chunk order when responses arrive out of order', async t => {
    let active = 0, peak = 0, finished = [], paid = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/jobs/extract')) return Response.json({ id: 'parallel', state: 'ready', chunks: Array.from({ length: 4 }, (_, index) => ({ index, offset: index * 10, duration: 10 })) });
        if (options.method === 'DELETE') { assert.equal(active, 0); return Response.json({}); }
        if (url.includes('/chunks/')) return new Response(new Blob([url.split('/').at(-1)]));
        assert.equal(url, 'https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo');
        assert.deepEqual(options.headers, { Authorization: 'Bearer ONLY_DEEP_KEY' });
        const index = Number(await options.body.get('audio').text());
        paid++; active++; peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, index === 0 ? 50 : 5));
        finished.push(index); active--;
        return Response.json({ segments: [{ start: 1, end: 2, text: `part ${index}` }] });
    });
    const result = await processVideo('abcdefghijk', configured({ parallelRequests: 2 }), new AbortController().signal, () => {});
    assert.equal(peak, 2); assert.equal(paid, 4); assert.notEqual(finished[0], 0);
    assert.deepEqual(result.segments.map(cue => [cue.start, cue.text]), [[1, 'part 0'], [11, 'part 1'], [21, 'part 2'], [31, 'part 3']]);
});

test('a parallel failure aborts in-flight work, starts no queued uploads, never retries and deletes the backend job', async t => {
    let paid = 0, aborted = 0, deleted = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/jobs/extract')) return Response.json({ id: 'failed', state: 'ready', chunks: Array.from({ length: 5 }, (_, index) => ({ index, offset: index * 10, duration: 10 })) });
        if (options.method === 'DELETE') { deleted++; assert.equal(aborted, 1); return Response.json({}); }
        if (url.includes('/chunks/')) return new Response(new Blob([url.split('/').at(-1)]));
        paid++;
        const index = Number(await options.body.get('audio').text());
        if (index === 0) { await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ error: 'overloaded' }, { status: 429 }); }
        return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { aborted++; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true }));
    });
    await assert.rejects(processVideo('abcdefghijk', configured({ parallelRequests: 2 }), new AbortController().signal, () => {}), /DeepInfra HTTP 429/);
    assert.equal(paid, 2); assert.equal(deleted, 1);
});

test('parallel requests stop on user cancellation before starting another part', async t => {
    const controller = new AbortController(); let paid = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/jobs/extract')) return Response.json({ id: 'cancel', state: 'ready', chunks: Array.from({ length: 5 }, (_, index) => ({ index, offset: index * 10, duration: 10 })) });
        if (options.method === 'DELETE') return Response.json({});
        if (url.includes('/chunks/')) return new Response(new Blob(['audio']));
        paid++;
        return new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
            if (paid === 2) controller.abort();
        });
    });
    await assert.rejects(processVideo('abcdefghijk', configured({ parallelRequests: 2 }), controller.signal, () => {}), { name: 'AbortError' });
    assert.equal(paid, 2);
    assert.throws(() => validateSettings({ parallelRequests: 4 }), /parallelRequests/);
});
