import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribe, chatTranscript, listModels } from '../api/provider.js';
import { backend } from '../api/backend.js';
import { DEFAULTS, validateSettings, providerRouting } from '../api/config.js';
import { normalize, formatTranscript } from '../subtitles/formats.js';
import { sendToAsbplayer, boundMedia } from '../integrations/asbplayer.js';
import { processVideo } from '../api/transcription.js';

test('OpenRouter receives multipart audio and only transcription credentials', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://openrouter.ai/api/v1/audio/transcriptions');
        assert.equal(options.headers.Authorization, 'Bearer APIKEY');
        assert.equal(options.headers['X-OpenRouter-Title'], 'Buttercup');
        assert.equal(options.headers['HTTP-Referer'], 'http://localhost:8767');
        assert.equal(options.body.get('response_format'), 'verbose_json');
        assert.equal(options.body.get('timestamp_granularities[]'), 'word');
        assert.deepEqual(options.body.getAll('timestamp_granularities[]'), ['word', 'segment']);
        assert.equal(options.body.get('model'), DEFAULTS.model);
        assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
        assert.doesNotMatch(JSON.stringify(options.headers), /COOKIE|BACKEND/);
        return Response.json({ words: [{ word: 'Hi', start: 0, end: 1 }] });
    });
    await transcribe({ ...DEFAULTS, apiKey: 'APIKEY', backendToken: 'BACKEND' }, new Blob(['audio']));
});
test('provider errors redact returned credentials and preserve status', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Bad SECRET' } }, { status: 401 }));
    await assert.rejects(transcribe({ ...DEFAULTS, apiKey: 'SECRET' }, new Blob(['audio'])), /HTTP 401: Bad \[redacted\]/);
});
test('audio chat pins the selected provider, disables fallback and sends base64 audio as JSON', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
        const body = JSON.parse(options.body);
        assert.deepEqual(body.provider, { require_parameters: true, only: ['groq'], allow_fallbacks: false });
        assert.equal(body.model, 'test/audio-chat');
        assert.equal(body.stream, false);
        assert.deepEqual(body.response_format, { type: 'json_object' });
        assert.equal(options.headers['Content-Type'], 'application/json');
        assert.equal(options.headers.Authorization, 'Bearer CHAT_KEY');
        assert.equal(options.headers['X-OpenRouter-Title'], 'Buttercup');
        assert.equal(options.headers['HTTP-Referer'], 'http://localhost:8767');
        const audio = body.messages[1].content[0];
        assert.equal(audio.type, 'input_audio');
        assert.equal(audio.input_audio.format, 'wav');
        assert.equal(Buffer.from(audio.input_audio.data, 'base64').toString(), 'audio bytes');
        assert.doesNotMatch(options.body, /CHAT_KEY|LOCAL_TOKEN|cookies/);
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
            text: 'Olá', language: 'pt', segments: [{ start: .1, end: .9, text: 'Olá' }],
        }) } }] });
    });
    const result = await transcribe({ ...DEFAULTS, openrouterMode: 'chat', openrouterProvider: 'groq',
        model: 'test/audio-chat', apiKey: 'CHAT_KEY', backendToken: 'LOCAL_TOKEN' }, new Blob(['audio bytes'], { type: 'audio/wav' }));
    assert.deepEqual(formatTranscript(normalize(result), DEFAULTS), [{ start: .1, end: .9, text: 'Olá' }]);
});
test('automatic audio chat omits the provider allowlist', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.deepEqual(JSON.parse(options.body).provider, { require_parameters: true });
        return Response.json({ choices: [{ message: { content: '{"segments":[{"start":0,"end":1,"text":"timed"}]}' } }] });
    });
    await transcribe({ ...DEFAULTS, model: 'test/audio-chat', openrouterMode: 'chat' }, new Blob(['audio']));
});
test('chat transcription can use supplied segments when optional word timings have zero duration', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => Response.json({ choices: [{ message: { content: JSON.stringify({
        words: [{ word: 'Olá', start: 0, end: 0 }], segments: [{ start: .1, end: 1, text: 'Olá mundo' }],
    }) } }] }));
    const transcript = normalize(await transcribe({ ...DEFAULTS, model: 'test/audio-chat', openrouterMode: 'chat' }, new Blob(['audio'])));
    assert.deepEqual(formatTranscript(transcript, DEFAULTS), [{ start: .1, end: 1, text: 'Olá mundo' }]);
    assert.equal(transcript.warnings.length, 1);
    assert.equal(fetch.mock.callCount(), 1, 'Normalization fallback must not send another paid request');
});
test('chat transcript parsing preserves actual timing and does not assign times to untimed text', () => {
    const fenced = chatTranscript({ choices: [{ message: { content: '```json\n{"words":[{"word":"Hi","start":0.2,"end":0.6}]}\n```' } }] });
    assert.equal(normalize(fenced).words[0].start, .2);
    for (const content of ['Plain untimed transcript', '{"text":"untimed JSON"}']) {
        const transcript = normalize(chatTranscript({ choices: [{ message: { content } }] }));
        assert.equal(transcript.words.length, 0); assert.equal(transcript.segments.length, 0);
        assert.throws(() => formatTranscript(transcript, DEFAULTS), /without usable timestamps/);
    }
    assert.throws(() => chatTranscript({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }), /truncated/);
    assert.throws(() => chatTranscript({ choices: [{ message: { content: '{"segments":"bad"}' } }] }), /invalid timestamp arrays/);
    assert.throws(() => formatTranscript(normalize(chatTranscript({ choices: [{ message: { content: '{"segments":[{"start":null,"end":1,"text":"no time"}]}' } }] })), DEFAULTS), /numeric timestamps/);
});
test('a failed pinned request never retries a different endpoint or provider', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.ok(url.endsWith('/chat/completions'));
        assert.deepEqual(JSON.parse(options.body).provider.only, ['unavailable-provider']);
        return Response.json({ error: { message: 'No allowed provider available' } }, { status: 404 });
    });
    await assert.rejects(transcribe({ ...DEFAULTS, model: 'test/audio-chat', openrouterMode: 'chat', openrouterProvider: 'unavailable-provider' }, new Blob(['audio'])), /404/);
    assert.equal(fetch.mock.callCount(), 1);
});

test('strict DeepInfra shorthand for an audio chat model sends one provider and never retries a rejected request', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'test/audio-chat');
        assert.deepEqual(body.provider, { require_parameters: true, only: ['deepinfra'], allow_fallbacks: false });
        assert.equal(body.models, undefined, 'Do not provide fallback models');
        return Response.json({ error: { message: 'DeepInfra unavailable' } }, { status: 503 });
    });
    await assert.rejects(transcribe({ ...DEFAULTS, openrouterMode: 'chat', openrouterNoFallback: true,
        model: 'test/audio-chat:deepinfra' }, new Blob(['audio'])), /DeepInfra unavailable/);
    assert.equal(fetch.mock.callCount(), 1);
});

test('Whisper chat is rejected before extraction or upload, including strict shorthand and Custom OpenRouter', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Do not extract or upload a known unsupported model'));
    for (const change of [
        { openrouterMode: 'chat', model: 'openai/whisper-large-v3-turbo' },
        { openrouterMode: 'chat', model: 'openai/whisper-large-v3-turbo:deepinfra', openrouterNoFallback: true },
        { provider: 'custom', customMode: 'chat', model: 'openai/whisper-large-v3-turbo' },
    ]) {
        const settings = { ...DEFAULTS, ...change, backendToken: 'TOKEN', apiKey: 'KEY', cache: false };
        await assert.rejects(transcribe(settings, new Blob(['audio'])), /Whisper cannot use OpenRouter Chat Completions/);
        await assert.rejects(processVideo('abcdefghijk', settings, new AbortController().signal, () => {}), /Whisper cannot use OpenRouter Chat Completions/);
    }
    assert.equal(fetch.mock.callCount(), 0);
});

test('strict routing blocks unsupported OpenRouter routes, missing pins and conflicts before any network request', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Must not upload audio or start backend extraction'));
    for (const change of [
        { openrouterNoFallback: true, model: 'openai/whisper-large-v3-turbo:deepinfra' },
        { provider: 'custom', customMode: 'transcriptions', openrouterNoFallback: true, customProvider: 'deepinfra' },
        { provider: 'custom', customMode: 'transcriptions', customProvider: 'deepinfra' },
    ]) {
        const settings = { ...DEFAULTS, ...change, backendToken: 'TOKEN', apiKey: 'KEY', cache: false };
        await assert.rejects(transcribe(settings, new Blob(['audio'])), /unavailable on OpenRouter Audio Transcriptions/);
        await assert.rejects(processVideo('abcdefghijk', settings, new AbortController().signal, () => {}), /unavailable on OpenRouter Audio Transcriptions/);
    }
    await assert.rejects(transcribe({ ...DEFAULTS, openrouterMode: 'chat', openrouterNoFallback: true }, new Blob(['audio'])), /requires a Pin provider/);
    await assert.rejects(transcribe({ ...DEFAULTS, openrouterMode: 'chat', openrouterNoFallback: true,
        model: 'openai/whisper-large-v3-turbo:deepinfra', openrouterProvider: 'groq' }, new Blob(['audio'])), /conflicts/);
    assert.equal(fetch.mock.callCount(), 0);
});

test('strict routing preserves model variants and ignores inactive OpenRouter preferences on a different API', () => {
    assert.deepEqual(providerRouting({ ...DEFAULTS, openrouterNoFallback: true, openrouterMode: 'chat',
        model: 'test/model:free', openrouterProvider: 'deepinfra' }), { model: 'test/model:free', pin: 'deepinfra', strict: true });
    const custom = validateSettings({ provider: 'custom', baseUrl: 'https://custom.example/v1',
        model: 'custom/model:version', openrouterNoFallback: true });
    assert.deepEqual(providerRouting(custom), { model: 'custom/model:version', pin: '', strict: false });
});
test('provider pinning is validated and never silently sent to the transcription endpoint', async t => {
    assert.equal(validateSettings({ openrouterMode: 'chat', openrouterProvider: ' Groq ' }).openrouterProvider, 'groq');
    assert.throws(() => validateSettings({ openrouterProvider: 'groq' }), /Chat Completions/);
    assert.throws(() => validateSettings({ openrouterMode: 'chat', openrouterProvider: 'groq,other' }), /provider slug/);
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not upload audio'); });
    await assert.rejects(transcribe({ ...DEFAULTS, openrouterProvider: 'groq' }, new Blob(['audio'])), /Chat Completions/);
    assert.equal(fetch.mock.callCount(), 0);
});
test('chat model discovery filters out models without audio input', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(url, 'https://openrouter.ai/api/v1/models');
        return Response.json({ data: [{ id: 'text-only', architecture: { input_modalities: ['text'] } },
            { id: 'audio-chat', architecture: { input_modalities: ['text', 'audio'] } }, { id: 'unknown' }] });
    });
    assert.deepEqual(await listModels({ ...DEFAULTS, openrouterMode: 'chat' }), ['audio-chat']);
});

test('OpenRouter speech discovery offers the full transcription catalog instead of a Whisper-only allowlist', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(url, 'https://openrouter.ai/api/v1/models?output_modalities=transcription');
        return Response.json({ data: [{ id: 'openai/whisper-large-v3-turbo' }, { id: 'elevenlabs/scribe-v2' }, { id: 'new/asr-model' }] });
    });
    assert.deepEqual(await listModels({ ...DEFAULTS }), ['openai/whisper-large-v3-turbo', 'elevenlabs/scribe-v2', 'new/asr-model']);
});
test('custom chat supports typed models and optional provider pinning at the custom URL', async t => {
    const pins = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://custom.example/v1/chat/completions');
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'manually/typed-model');
        assert.equal(options.headers.Authorization, 'Bearer CUSTOM_KEY');
        assert.equal(options.headers['X-Custom'], 'header-value');
        assert.equal(options.headers['X-OpenRouter-Title'], undefined);
        assert.equal(options.headers['HTTP-Referer'], undefined);
        assert.equal(body.messages[1].content[0].input_audio.format, 'mp3');
        pins.push(body.provider);
        return Response.json({ choices: [{ message: { content: '{"segments":[{"start":0,"end":1,"text":"timed"}]}' } }] });
    });
    const settings = validateSettings({ provider: 'custom', baseUrl: 'https://custom.example/v1', customMode: 'chat',
        customProvider: ' Custom-Provider/Region-A ', model: 'manually/typed-model', apiKey: 'CUSTOM_KEY', extraHeaders: { 'X-Custom': 'header-value' } });
    await transcribe(settings, new Blob(['audio']));
    await transcribe({ ...settings, customProvider: '' }, new Blob(['audio']));
    assert.deepEqual(pins, [{ only: ['custom-provider/region-a'], allow_fallbacks: false }, undefined]);
    assert.throws(() => validateSettings({ ...settings, translate: true, supportsTranslation: true }), /audio\/translations/);
});
test('custom transcription omits routing by default and includes an optional routing field when configured', async t => {
    const pins = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://custom.example/v1/audio/transcriptions');
        assert.equal(options.body.get('prompt'), 'vocabulary');
        pins.push(options.body.get('provider'));
        return Response.json({ segments: [{ start: 0, end: 1, text: 'timed' }] });
    });
    const settings = validateSettings({ provider: 'custom', baseUrl: 'https://custom.example/v1', prompt: 'vocabulary' });
    await transcribe(settings, new Blob(['audio']));
    await transcribe({ ...settings, customProvider: 'manual-provider' }, new Blob(['audio']));
    assert.equal(pins[0], null);
    assert.deepEqual(JSON.parse(pins[1]), { only: ['manual-provider'], allow_fallbacks: false });
});
test('custom model catalogs without modality metadata remain usable in chat mode', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(url, 'https://custom.example/v1/models');
        return Response.json({ data: [{ id: 'custom/audio-model' }] });
    });
    assert.deepEqual(await listModels({ ...DEFAULTS, provider: 'custom', baseUrl: 'https://custom.example/v1', customMode: 'chat' }), ['custom/audio-model']);
});

test('OpenRouter attribution also applies through Custom and cannot have conflicting title headers', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(new URL(url).hostname, 'openrouter.ai');
        assert.deepEqual(Object.keys(options.headers).filter(key => /title/i.test(key)), ['X-OpenRouter-Title']);
        assert.equal(options.headers['X-OpenRouter-Title'], 'Buttercup');
        assert.equal(options.headers['HTTP-Referer'], 'http://localhost:8767');
        return url.endsWith('/models') ? Response.json({ data: [] }) : Response.json({ segments: [] });
    });
    const settings = { ...DEFAULTS, provider: 'custom', extraHeaders: { 'x-title': 'old', 'x-openrouter-title': 'old' } };
    await transcribe(settings, new Blob(['audio']));
    await listModels(settings);
});
test('backend requests send only the pairing token', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:8767/health');
        assert.deepEqual(options.headers, { Authorization: 'Bearer TOKEN' });
        return Response.json({ status: 'ok' });
    });
    assert.equal((await backend({ ...DEFAULTS, apiKey: 'PRIVATE', backendToken: 'TOKEN' }, '/health')).status, 'ok');
});
test('asbplayer official HTTP body uses UTF-8 base64 SRT and optional mediaId', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:8766/asbplayer/load-subtitles');
        const payload = JSON.parse(options.body);
        assert.equal(payload.mediaId, 'target');
        assert.match(Buffer.from(payload.files[0].base64, 'base64').toString('utf8'), /ação 日本語/);
        assert.doesNotMatch(options.body, /APIKEY|TOKEN/);
        return Response.json({});
    });
    await sendToAsbplayer({ ...DEFAULTS, mediaId: 'target', apiKey: 'APIKEY', backendToken: 'TOKEN' }, [{ start: 0, end: 2, text: 'ação 日本語' }], 'video.srt');
});

test('asbplayer subtitle loading accepts empty successful replies without JSON parsing or another request', async t => {
    let reply, requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return reply; });
    for (const status of [200, 204]) {
        reply = new Response(null, { status });
        assert.deepEqual(await sendToAsbplayer(DEFAULTS, [{ start: 0, end: 1, text: 'ready' }], 'video.srt'), { accepted: true });
    }
    assert.equal(requests, 2);
});

test('asbplayer failures keep HTTP status and invalid media data has a specific error', async t => {
    let reply;
    t.mock.method(globalThis, 'fetch', async () => reply);
    reply = new Response(null, { status: 503 });
    await assert.rejects(sendToAsbplayer(DEFAULTS, [{ start: 0, end: 1, text: 'ready' }], 'video.srt'), /asbplayer HTTP 503/);
    reply = new Response(null, { status: 200 });
    await assert.rejects(boundMedia(DEFAULTS), /asbplayer returned an invalid media list/);
    reply = Response.json({ media: [] });
    assert.deepEqual(await boundMedia(DEFAULTS), { media: [] });
});
test('cancelled extraction is deleted even when transcription fails', async t => {
    const paths = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        paths.push([url, options.method]);
        if (options.method === 'DELETE') return Response.json({ deleted: true });
        if (url.endsWith('/jobs/extract')) return Response.json({ id: 'abc', state: 'ready', chunks: [{ index: 0, offset: 0, duration: 1 }] });
        if (url.endsWith('/chunks/0')) return new Response(new Blob(['audio']));
        return Response.json({ error: { message: 'upstream unavailable' } }, { status: 503 });
    });
    await assert.rejects(processVideo('abcdefghijk', { ...DEFAULTS, cache: false, apiKey: 'APIKEY', backendToken: 'TOKEN' }, new AbortController().signal, () => {}), /503/);
    assert.ok(paths.some(([url, method]) => url.endsWith('/jobs/abc') && method === 'DELETE'));
});

test('original audio selection reaches the backend before upload and preserves chat provider pinning', async t => {
    const paths = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        paths.push(url);
        if (url.endsWith('/health')) return Response.json({ audio_track_selection: ['default', 'original'] });
        if (options.method === 'DELETE') return Response.json({});
        if (url.endsWith('/jobs/extract')) {
            assert.equal(JSON.parse(options.body).audio_track, 'original');
            return Response.json({ id: 'abc', state: 'ready', audio_track: 'original', chunks: [{ index: 0, offset: 0, duration: 1 }] });
        }
        if (url.endsWith('/chunks/0')) return new Response(new Blob(['original audio']));
        assert.ok(url.endsWith('/chat/completions'));
        const payload = JSON.parse(options.body);
        assert.deepEqual(payload.provider.only, ['groq']);
        assert.equal(payload.provider.allow_fallbacks, false);
        assert.equal(Buffer.from(payload.messages[1].content[0].input_audio.data, 'base64').toString(), 'original audio');
        return Response.json({ choices: [{ message: { content: '{"segments":[{"start":0,"end":1,"text":"original"}]}' } }] });
    });
    const result = await processVideo('abcdefghijk', { ...DEFAULTS, cache: false, apiKey: 'KEY', backendToken: 'TOKEN',
        audioTrack: 'original', model: 'test/audio-chat', openrouterMode: 'chat', openrouterProvider: 'groq' }, new AbortController().signal, () => {});
    assert.equal(result.record.descriptor.audioTrack, 'original');
    assert.ok(paths[0].endsWith('/health'));
});

test('an old backend or unconfirmed original track cannot upload audio', async t => {
    const settings = { ...DEFAULTS, cache: false, apiKey: 'KEY', backendToken: 'TOKEN', audioTrack: 'original' };
    const paths = [];
    let capable = false;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        paths.push(url);
        if (url.endsWith('/health')) return Response.json(capable ? { audio_track_selection: ['original'] } : {});
        if (options.method === 'DELETE') return Response.json({});
        if (url.endsWith('/jobs/extract')) return Response.json({ id: 'abc', state: 'ready', audio_track: 'default', chunks: [] });
        throw new Error('Must not download chunks or call a paid provider');
    });
    await assert.rejects(processVideo('abcdefghijk', settings, new AbortController().signal, () => {}), /Restart the local/);
    assert.equal(paths.length, 1);
    capable = true;
    await assert.rejects(processVideo('abcdefghijk', settings, new AbortController().signal, () => {}), /did not confirm/);
    assert.ok(paths.at(-1).endsWith('/jobs/abc'));
});
