import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { cacheDescriptor, cacheKey, cacheOperation, publicRecord } from '../cache/local.js';
import { DEFAULTS } from '../api/config.js';
import { processVideo } from '../api/transcription.js';

test('persistent IndexedDB deduplicates identical keys and cache is checked before backend and provider', async () => {
    const descriptor = cacheDescriptor('abcdefghijk', DEFAULTS), key = await cacheKey(descriptor);
    const record = { key, descriptor, transcript: { segments: [{ start: 0, end: 1, text: 'cached' }], words: [], language: 'en' }, createdAt: '2026-01-01T00:00:00Z', revision: 1 };
    await cacheOperation('clear'); await cacheOperation('put', record); await cacheOperation('put', record);
    assert.equal((await cacheOperation('getAll')).length, 1);
    const original = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('Cache hit must not make network requests'); };
    try {
        const result = await processVideo('abcdefghijk', DEFAULTS, new AbortController().signal, () => {});
        assert.equal(result.source, 'cache'); assert.equal(result.segments[0].text, 'cached');
    } finally { globalThis.fetch = original; await cacheOperation('clear'); }
});
test('cache key includes language, model, endpoint, task and prompt but excludes keys and formatting', async () => {
    const initial = await cacheKey(cacheDescriptor('abcdefghijk', DEFAULTS));
    assert.equal(await cacheKey(cacheDescriptor('abcdefghijk', { ...DEFAULTS, apiKey: 'SECRET', backendToken: 'TOKEN', maxLineLength: 1 })), initial);
    for (const change of [{ audioTrack: 'original' }, { language: 'pt' }, { model: 'other' }, { baseUrl: 'https://other.example/v1' }, { translate: true }, { prompt: 'other' }]) assert.notEqual(await cacheKey(cacheDescriptor('abcdefghijk', { ...DEFAULTS, ...change })), initial);
});
test('shared payload is an allowlist excluding credentials, audio and endpoint details', () => {
    const record = publicRecord({ key: 'a'.repeat(64), descriptor: cacheDescriptor('abcdefghijk', { ...DEFAULTS, apiKey: 'SECRET' }),
        createdAt: '2026-01-01', cookiefile: 'private', apiKey: 'SECRET', audio: 'private', transcript: { words: [], segments: [{ start: 0, end: 1, text: 'caption' }], cookie: 'private' } });
    assert.doesNotMatch(JSON.stringify(record), /SECRET|private|endpoint|prompt/);
});

test('mixed timestamp fallback survives cache sharing and cached playback without a provider request', async t => {
    const descriptor = cacheDescriptor('foCBPrpbO68', { ...DEFAULTS, provider: 'deepinfra' }), key = await cacheKey(descriptor);
    const fallback = [{ start: 120, end: 123, text: 'fallback speech' }];
    const record = { key, descriptor, transcript: { words: [{ start: 0, end: 1, text: 'word' }], segments: fallback, wordFallbacks: fallback } };
    assert.deepEqual(publicRecord(record).transcript.wordFallbacks, fallback);
    await cacheOperation('clear'); await cacheOperation('put', record);
    t.mock.method(globalThis, 'fetch', async () => assert.fail('Repairing cached timing must not call any API'));
    const result = await processVideo('foCBPrpbO68', { ...DEFAULTS, provider: 'deepinfra' }, new AbortController().signal, () => {});
    assert.equal(result.source, 'cache');
    assert.deepEqual(result.segments.map(item => item.text), ['word', 'fallback speech']);
    await cacheOperation('clear');
});
test('chat transport and pinned provider have separate cache entries; default transcription keys stay compatible', async () => {
    const original = cacheDescriptor('abcdefghijk', DEFAULTS);
    assert.equal(Object.hasOwn(original, 'transport'), false);
    assert.equal(Object.hasOwn(original, 'upstreamProvider'), false);
    const automatic = cacheDescriptor('abcdefghijk', { ...DEFAULTS, openrouterMode: 'chat' });
    const pinned = cacheDescriptor('abcdefghijk', { ...DEFAULTS, openrouterMode: 'chat', openrouterProvider: 'groq' });
    const other = cacheDescriptor('abcdefghijk', { ...DEFAULTS, openrouterMode: 'chat', openrouterProvider: 'deepinfra' });
    const keys = await Promise.all([original, automatic, pinned, other].map(cacheKey));
    assert.equal(new Set(keys).size, 4);
    assert.equal(publicRecord({ key: keys[1], descriptor: automatic, transcript: { words: [], segments: [] } }).descriptor.upstreamProvider, '');
    assert.notEqual(await cacheKey(cacheDescriptor('abcdefghijk', { ...DEFAULTS, openrouterMode: 'chat', openrouterProvider: 'auto' })), keys[1]);
    const shared = publicRecord({ key: keys[2], descriptor: pinned, transcript: { words: [], segments: [{ start: 0, end: 1, text: 'pinned' }] } });
    assert.equal(shared.descriptor.upstreamProvider, 'groq');
    assert.equal(shared.descriptor.transport, 'chat-completions');
    await cacheOperation('clear');
    await cacheOperation('put', { key: keys[1], descriptor: automatic, transcript: { words: [], segments: [{ start: 0, end: 1, text: 'automatic' }] } });
    assert.equal(await cacheOperation('get', keys[2]), undefined);
    await cacheOperation('clear');
});
test('custom cache separates endpoints and routing while inactive OpenRouter settings have no effect', async () => {
    const settings = { ...DEFAULTS, provider: 'custom', baseUrl: 'https://custom.example/v1' };
    const variations = [{}, { customProvider: 'a' }, { customProvider: 'b' }, { customMode: 'chat' }, { customMode: 'chat', customProvider: 'a' }];
    const descriptors = variations.map(change => cacheDescriptor('abcdefghijk', { ...settings, ...change }));
    const keys = await Promise.all(descriptors.map(cacheKey));
    assert.equal(new Set(keys).size, 5);
    assert.equal(await cacheKey(cacheDescriptor('abcdefghijk', { ...settings, openrouterMode: 'chat', openrouterProvider: 'groq' })), keys[0]);
    for (const descriptor of descriptors) {
        const record = publicRecord({ key: 'a'.repeat(64), descriptor, transcript: { words: [], segments: [] } });
        assert.equal(record.descriptor.upstreamProvider, descriptor.upstreamProvider);
    }
});

test('strict routing separates older cache entries and normalizes model-provider shorthand', async () => {
    const settings = { ...DEFAULTS, openrouterMode: 'chat', openrouterProvider: 'deepinfra' };
    const old = cacheDescriptor('abcdefghijk', settings);
    const strict = cacheDescriptor('abcdefghijk', { ...settings, openrouterNoFallback: true });
    const shorthand = cacheDescriptor('abcdefghijk', { ...settings, openrouterProvider: '', openrouterNoFallback: true, model: DEFAULTS.model + ':deepinfra' });
    assert.equal(await cacheKey(strict), await cacheKey(shorthand));
    assert.notEqual(await cacheKey(strict), await cacheKey(old));
    assert.equal(publicRecord({ key: 'a'.repeat(64), descriptor: strict, transcript: { words: [], segments: [] } }).descriptor.neverFallback, true);
});

test('DeepInfra has its own cache and cached formatting works without a provider key or network request', async t => {
    const settings = { ...DEFAULTS, provider: 'deepinfra' };
    const descriptor = cacheDescriptor('abcdefghijk', settings), key = await cacheKey(descriptor);
    assert.notEqual(key, await cacheKey(cacheDescriptor('abcdefghijk', DEFAULTS)));
    assert.equal(key, await cacheKey(cacheDescriptor('abcdefghijk', { ...settings, apiKey: 'OTHER_KEY',
        baseUrl: 'https://other.example/v1', model: 'other/model', customMode: 'chat', customProvider: 'other', audioMode: 'whole', parallelRequests: 3 })));
    assert.notEqual(key, await cacheKey(cacheDescriptor('abcdefghijk', { ...settings, deepinfraModel: 'openai/whisper-large-v3' })));
    const record = { key, descriptor, transcript: { words: [{ start: 0, end: .5, text: 'cached' }, { start: .5, end: 1, text: 'words' }], segments: [] } };
    assert.equal(publicRecord(record).descriptor.transport, 'deepinfra-native');
    await cacheOperation('clear'); await cacheOperation('put', record);
    t.mock.method(globalThis, 'fetch', async () => assert.fail('Cached formatting must not use the network'));
    const result = await processVideo('abcdefghijk', { ...settings, wordsPerLine: 1 }, new AbortController().signal, () => {});
    assert.equal(result.source, 'cache'); assert.equal(result.segments.length, 2);
    await cacheOperation('clear');
});

test('Groq cache is separate and ignores inactive provider settings while retaining cached reformatting', async t => {
    const settings = { ...DEFAULTS, provider: 'groq' };
    const descriptor = cacheDescriptor('abcdefghijk', settings), key = await cacheKey(descriptor);
    assert.notEqual(key, await cacheKey(cacheDescriptor('abcdefghijk', DEFAULTS)));
    assert.notEqual(key, await cacheKey(cacheDescriptor('abcdefghijk', { ...DEFAULTS, provider: 'deepinfra' })));
    assert.equal(key, await cacheKey(cacheDescriptor('abcdefghijk', { ...settings, model: 'other', baseUrl: 'https://other.example/v1',
        groqApiKey: 'KEY', deepinfraModel: 'other/asr', responseFormat: 'json' })));
    assert.notEqual(key, await cacheKey(cacheDescriptor('abcdefghijk', { ...settings, groqModel: 'whisper-large-v3' })));
    const record = { key, descriptor, transcript: { words: [{ start: 0, end: .5, text: 'cached' }, { start: .5, end: 1, text: 'Groq' }], segments: [] } };
    assert.equal(publicRecord(record).descriptor.transport, 'groq-transcriptions');
    await cacheOperation('clear'); await cacheOperation('put', record);
    t.mock.method(globalThis, 'fetch', async () => assert.fail('Do not retranscribe a cached video'));
    const result = await processVideo('abcdefghijk', { ...settings, wordsPerLine: 1 }, new AbortController().signal, () => {});
    assert.equal(result.source, 'cache'); assert.equal(result.segments.length, 2);
    await cacheOperation('clear');
});

test('DeepInfra segment-only cached subtitles obey a new word limit without network or cache mutation', async t => {
    const settings={...DEFAULTS,provider:'deepinfra',wordsPerLine:2,maxLineLength:0};
    const descriptor=cacheDescriptor('I14AJ40Jlzs',settings),key=await cacheKey(descriptor);
    const record={key,descriptor,revision:1,transcript:{words:[],segments:[{start:0,end:8,text:'one two three four five six'}],warnings:['Invalid word timestamps; using the segment timestamps returned by the provider.']}};
    await cacheOperation('put',record);
    t.mock.method(globalThis,'fetch',()=>assert.fail('Reformatting a cache hit must not call any service'));
    const result=await processVideo('I14AJ40Jlzs',settings,new AbortController().signal,()=>{});
    assert.equal(result.source,'cache');assert.deepEqual(result.segments.map(c=>c.text),['one two','three four','five six']);
    assert.match(result.formatWarnings[0],/estimated/);
    const restored=await processVideo('I14AJ40Jlzs',{...settings,wordsPerLine:12},new AbortController().signal,()=>{});
    assert.equal(restored.segments.length,1);assert.deepEqual(restored.formatWarnings,[]);
    const original=await processVideo('I14AJ40Jlzs',{...settings,cueBreaks:'provider'},new AbortController().signal,()=>{});
    assert.deepEqual(original.segments,record.transcript.segments);assert.deepEqual(original.formatWarnings,[]);
    assert.deepEqual((await cacheOperation('get',key)).transcript,record.transcript);
    await cacheOperation('clear');
});

test('explicit regeneration bypasses local and community caches, refreshes once, and preserves old cache on failure', async t => {
    const settings={...DEFAULTS,provider:'deepinfra',deepinfraApiKey:'SYNTHETIC_KEY',backendToken:'SYNTHETIC_LOCAL',communityRead:true,communityUrl:'https://community.example'};
    const descriptor=cacheDescriptor('abcdefghijk',settings),key=await cacheKey(descriptor);
    const record={key,descriptor,revision:2,transcript:{words:[],segments:[{start:0,end:2,text:'old cached text'}]}};
    await cacheOperation('put',record);
    let paid=0,fail=false;
    t.mock.method(globalThis,'fetch',async (url,options={})=>{
        assert.ok(!url.startsWith(settings.communityUrl));
        if(url.endsWith('/jobs/extract')) return Response.json({id:'fresh',state:'ready',chunks:[{index:0,offset:0,duration:5}]});
        if(options.method==='DELETE') return Response.json({});
        if(url.includes('/chunks/')) return new Response(new Blob(['synthetic-audio']));
        assert.ok(url.startsWith('https://api.deepinfra.com/'));
        paid++;
        return fail ? Response.json({error:'fixture failure'},{status:503}) : Response.json({segments:[{start:0,end:2,text:'fresh transcript'}]});
    });
    const generate=options=>processVideo('abcdefghijk',settings,new AbortController().signal,()=>{},options);
    assert.equal((await generate()).source,'cache');assert.equal(paid,0);
    assert.equal((await generate({ignoreCache:true})).source,'transcription');assert.equal(paid,1);
    assert.equal((await generate()).segments[0].text,'fresh transcript');assert.equal(paid,1);
    fail=true;
    await assert.rejects(generate({ignoreCache:true}),/503/);assert.equal(paid,2);
    assert.equal((await generate()).segments[0].text,'fresh transcript');assert.equal(paid,2);
    await cacheOperation('clear');
});
