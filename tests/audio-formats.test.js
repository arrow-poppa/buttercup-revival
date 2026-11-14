import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { DEFAULTS, audioFormat, audioProfileKey, validateSettings } from '../api/config.js';
import { formDraft, draftSettings, exportDraft, importDraft, saveSettings, popupSettings, persistDraft, commitDraft } from '../api/settings.js';
import { processVideo } from '../api/transcription.js';
import { transcribe } from '../api/provider.js';
import { cacheDescriptor, cacheKey, cacheOperation } from '../cache/local.js';

const configured = extra => ({ ...DEFAULTS, provider: 'deepinfra', deepinfraApiKey: 'FIXTURE_KEY',
    backendToken: 'LOCAL_FIXTURE_TOKEN', cache: false, ...extra });
const withFlac = settings => ({ ...settings, audioFormatProfiles: { [audioProfileKey(settings)]: 'flac' } });

test('format preferences identify routes without credentials and preserve the MP3 default', () => {
    assert.equal(audioFormat(DEFAULTS), 'mp3');
    const settings = withFlac(configured());
    assert.equal(audioFormat(settings), 'flac');
    assert.equal(audioFormat({ ...settings, deepinfraApiKey: 'CHANGED_KEY', language: 'ja' }), 'flac');
    assert.doesNotMatch(audioProfileKey(settings), /FIXTURE|TOKEN/);
    assert.equal(audioFormat({ ...settings, provider: 'groq' }), 'mp3');
    assert.equal(audioFormat({ ...settings, deepinfraModel: 'Qwen/Qwen3-ASR-1.7B' }), 'mp3');
    const custom = { ...DEFAULTS, provider: 'custom', baseUrl: 'https://custom.example/v1/', model: 'speech' };
    assert.equal(audioProfileKey(custom), audioProfileKey({ ...custom, baseUrl: 'https://custom.example/v1' }));
    const flac = withFlac(custom);
    for (const change of [{ baseUrl: 'https://other.example/v1' }, { customMode: 'chat' }, { customProvider: 'groq' }, { model: 'other' }]) {
        assert.equal(audioFormat({ ...flac, ...change }), 'mp3');
    }
    const shorthand = { ...DEFAULTS, model: 'fixture/audio:groq', openrouterMode: 'chat', openrouterNoFallback: true };
    assert.equal(audioProfileKey(shorthand), audioProfileKey({ ...shorthand, model: 'fixture/audio', openrouterProvider: 'groq' }));
});

test('preferences survive drafts, export/import and storage; older backups restore MP3', async t => {
    const data = {};
    const previous = globalThis.chrome;
    globalThis.chrome = { storage: { local: {
        async get(keys) { return structuredClone(Object.fromEntries(keys.map(key => [key, data[key]]))); },
        async set(value) { Object.assign(data, structuredClone(value)); },
    } } };
    t.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
    const settings = withFlac(configured());
    await saveSettings(settings);
    const reopened = await popupSettings();
    assert.equal(audioFormat(draftSettings(reopened.draft)), 'flac');
    const exported = exportDraft(reopened.draft, 'test');
    const patch = importDraft(JSON.parse(JSON.stringify(exported)));
    assert.equal(audioFormat(draftSettings({ ...formDraft(DEFAULTS), ...patch })), 'flac');
    await persistDraft({ provider: 'groq' });
    assert.equal(audioFormat(await commitDraft()), 'mp3');
    await persistDraft({ provider: 'deepinfra' });
    assert.equal(audioFormat(await commitDraft()), 'flac');
    await persistDraft(importDraft({ app: 'buttercup-revival', settings: { language: 'ja' } }));
    assert.equal(audioFormat(await commitDraft()), 'mp3');
    for (const bad of [null, [], 'not json', { arbitrary: 'flac' }, { [audioProfileKey(settings)]: 'wav' },
        { [JSON.stringify(['custom', 'https://secret@example.com/v1', 'chat', 'speech', ''])]: 'flac' }]) {
        assert.throws(() => validateSettings({ audioFormatProfiles: bad }));
        assert.throws(() => importDraft({ app: 'buttercup-revival', settings: { audioFormatProfiles: bad } }));
    }
});

test('every provider sends the real FLAC filename and chat format; sample audio remains unchanged', async t => {
    for (const provider of ['deepinfra', 'groq', 'openrouter', 'custom']) {
        for (const chat of provider === 'openrouter' || provider === 'custom' ? [false, true] : [false]) {
            const settings = withFlac(configured({ provider, model: 'fixture/audio', openrouterMode: chat ? 'chat' : 'transcriptions',
                customMode: chat ? 'chat' : 'transcriptions', groqApiKey: 'FIXTURE_KEY', apiKey: 'FIXTURE_KEY' }));
            for (const format of ['flac', 'mp3']) {
                t.mock.method(globalThis, 'fetch', async (url, options) => {
                    if (chat) {
                        const audio = JSON.parse(options.body).messages[1].content[0].input_audio;
                        assert.equal(audio.format, format);
                        assert.equal(atob(audio.data), 'sample bytes');
                        return Response.json({ choices: [{ message: { content: '{"segments":[{"start":0,"end":1,"text":"sample"}]}' } }] });
                    }
                    const file = options.body.get(provider === 'deepinfra' ? 'audio' : 'file');
                    assert.equal(file.name, `audio.${format}`);
                    assert.equal(file.type, format === 'flac' ? 'audio/flac' : 'audio/mpeg');
                    assert.equal(await file.text(), 'sample bytes');
                    return Response.json({ segments: [{ start: 0, end: 1, text: 'sample' }] });
                });
                await transcribe(settings, new Blob(['sample bytes'], { type: format === 'flac' ? 'audio/flac' : 'audio/mpeg' }));
                t.mock.restoreAll();
            }
        }
    }
});

test('FLAC requires assistant support and confirmed metadata/MIME before paid uploads; cleanup always runs', async t => {
    const settings = withFlac(configured());
    let capable = false, confirmed = true, correctMime = true, paid = 0, extracted = 0, deleted = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/health')) return Response.json({ audio_formats: capable ? ['mp3', 'flac'] : undefined });
        if (url.endsWith('/jobs/extract')) {
            assert.equal(JSON.parse(options.body).audio_format, 'flac'); extracted++;
            return Response.json({ id: 'format', state: 'ready', audio_format: confirmed ? 'flac' : 'mp3', chunks: [{ index: 0, offset: 0, duration: 1 }] });
        }
        if (options.method === 'DELETE') { deleted++; return Response.json({}); }
        if (url.includes('/chunks/')) return new Response('audio bytes', { headers: { 'Content-Type': correctMime ? 'audio/flac' : 'audio/mpeg' } });
        paid++;
        assert.equal(options.body.get('audio').name, 'audio.flac');
        return Response.json({ segments: [{ start: 0, end: 1, text: 'sample' }] });
    });
    const generate = () => processVideo('abcdefghijk', settings, new AbortController().signal, () => {});
    await assert.rejects(generate(), /installer.*restart.*FLAC/);
    assert.equal(extracted, 0); assert.equal(paid, 0);
    capable = true; confirmed = false;
    await assert.rejects(generate(), /did not confirm.*audio format/);
    assert.equal(deleted, 1); assert.equal(paid, 0);
    confirmed = true; correctMime = false;
    await assert.rejects(generate(), /unexpected audio format/);
    assert.equal(deleted, 2); assert.equal(paid, 0);
    correctMime = true;
    assert.equal((await generate()).source, 'transcription');
    assert.equal(paid, 1); assert.equal(deleted, 3);
});

test('whole-audio FLAC confirms both capabilities and sends exactly one complete file', async t => {
    const settings = withFlac(configured({ audioMode: 'whole', parallelRequests: 3 }));
    let paid = 0, deleted = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/health')) return Response.json({ audio_formats: ['mp3', 'flac'], audio_modes: ['chunks', 'whole'] });
        if (url.endsWith('/jobs/extract')) {
            const payload = JSON.parse(options.body);
            assert.equal(payload.audio_mode, 'whole'); assert.equal(payload.audio_format, 'flac');
            return Response.json({ id: 'whole-flac', state: 'ready', audio_format: 'flac', audio_mode: 'whole', chunks: [{ index: 0, offset: 0, duration: 509 }] });
        }
        if (options.method === 'DELETE') { deleted++; return Response.json({}); }
        if (url.includes('/chunks/')) return new Response('whole FLAC', { headers: { 'Content-Type': 'audio/flac' } });
        paid++; assert.equal(options.body.get('audio').name, 'audio.flac');
        assert.equal(await options.body.get('audio').text(), 'whole FLAC');
        return Response.json({ segments: [{ start: 0, end: 509, text: 'complete video' }] });
    });
    const result = await processVideo('abcdefghijk', settings, new AbortController().signal, () => {});
    assert.equal(result.record.transcript.segments.at(-1).end, 509);
    assert.equal(paid, 1); assert.equal(deleted, 1);
});

test('switching formats reuses cached subtitles and explicit regeneration uses FLAC', async t => {
    const original = configured({ cache: true }), settings = withFlac(original);
    const descriptor = cacheDescriptor('abcdefghijk', original), key = await cacheKey(descriptor);
    assert.equal(key, await cacheKey(cacheDescriptor('abcdefghijk', settings)));
    await cacheOperation('clear');
    t.after(() => cacheOperation('clear'));
    await cacheOperation('put', { key, descriptor, transcript: { words: [], segments: [{ start: 0, end: 1, text: 'cached' }] } });
    let paid = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/health')) return Response.json({ audio_formats: ['mp3', 'flac'] });
        if (url.endsWith('/jobs/extract')) return Response.json({ id: 'cached', state: 'ready', audio_format: 'flac', chunks: [{ index: 0, offset: 0, duration: 1 }] });
        if (options.method === 'DELETE') return Response.json({});
        if (url.includes('/chunks/')) return new Response('new audio', { headers: { 'Content-Type': 'audio/flac' } });
        paid++; assert.equal(options.body.get('audio').name, 'audio.flac');
        return Response.json({ segments: [{ start: 0, end: 1, text: 'fresh FLAC' }] });
    });
    const generate = options => processVideo('abcdefghijk', settings, new AbortController().signal, () => {}, options);
    assert.equal((await generate()).source, 'cache'); assert.equal(paid, 0);
    assert.equal((await generate({ ignoreCache: true })).source, 'transcription'); assert.equal(paid, 1);
    assert.equal((await cacheOperation('get', key)).transcript.segments[0].text, 'fresh FLAC');
});
