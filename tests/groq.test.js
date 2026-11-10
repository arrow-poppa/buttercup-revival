import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateSettings, isChat, isOpenRouter, providerBaseUrl } from '../api/config.js';
import { transcribe, listModels } from '../api/provider.js';
import { processVideo } from '../api/transcription.js';
import { normalize, formatTranscript } from '../subtitles/formats.js';

const configured = () => validateSettings({ provider: 'groq', groqApiKey: 'GROQ_TEST_KEY',
    apiKey: 'ROUTER_KEY', deepinfraApiKey: 'DEEP_KEY', backendToken: 'LOCAL_TOKEN',
    customMode: 'chat', customProvider: 'other', openrouterNoFallback: true,
    extraHeaders: { 'X-Private': 'PRIVATE_HEADER' } });

test('Groq sends multipart Whisper transcription directly with its own credentials and valid timestamp options', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions');
        assert.deepEqual(options.headers, { Authorization: 'Bearer GROQ_TEST_KEY' });
        assert.equal(await options.body.get('file').text(), 'test audio');
        assert.equal(options.body.get('model'), 'whisper-large-v3-turbo');
        assert.equal(options.body.get('response_format'), 'verbose_json');
        assert.deepEqual(options.body.getAll('timestamp_granularities[]'), ['segment', 'word']);
        assert.equal(options.body.get('language'), 'pt');
        assert.equal(options.body.get('prompt'), 'Buttercup');
        assert.equal(options.body.has('provider'), false);
        assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
        return Response.json({ language: 'pt', words: [{ start: .1, end: .5, word: 'Olá' }, { start: .5, end: 1, word: 'mundo' }],
            segments: [{ start: .1, end: 1, text: 'Olá mundo' }] });
    });
    const settings = { ...configured(), language: 'pt', prompt: 'Buttercup', responseFormat: 'json' };
    assert.equal(isChat(settings), false); assert.equal(isOpenRouter(settings), false);
    assert.equal(providerBaseUrl(settings), 'https://api.groq.com/openai/v1');
    const transcript = normalize(await transcribe(settings, new Blob(['test audio'], { type: 'audio/mpeg' })));
    assert.equal(formatTranscript(transcript, { ...settings, wordsPerLine: 1 }).length, 2);
    assert.equal(fetch.mock.callCount(), 1);
});

test('Groq errors retain status, redact every provider key, and never retry another model or provider', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.ok(url.startsWith('https://api.groq.com/'));
        assert.deepEqual(options.body.getAll('timestamp_granularities[]'), ['segment']);
        return Response.json({ error: { message: 'GROQ_TEST_KEY ROUTER_KEY DEEP_KEY unavailable' } }, { status: 429 });
    });
    await assert.rejects(transcribe({ ...configured(), wordTimestamps: false }, new Blob(['audio'])), error => {
        assert.match(error.message, /Groq HTTP 429/);
        assert.doesNotMatch(error.message, /GROQ_TEST_KEY|ROUTER_KEY|DEEP_KEY/);
        return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
});

test('missing Groq key and incorrect model IDs fail before extraction or upload', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('No requests expected'));
    const settings = { ...configured(), groqApiKey: '', cache: false };
    await assert.rejects(transcribe(settings, new Blob(['audio'])), /Groq API key/);
    await assert.rejects(processVideo('abcdefghijk', settings, new AbortController().signal, () => {}), /Groq API key/);
    await assert.rejects(transcribe({ ...configured(), groqModel: 'openai/whisper-large-v3-turbo' }, new Blob(['audio'])), /without openai/);
    assert.equal(fetch.mock.callCount(), 0);
});

test('Groq catalog uses only the Groq key and offers active Whisper models', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.groq.com/openai/v1/models');
        assert.deepEqual(options.headers, { Authorization: 'Bearer GROQ_TEST_KEY' });
        return Response.json({ data: [{ id: 'whisper-large-v3-turbo', active: true }, { id: 'whisper-large-v3', active: true },
            { id: 'llama-text' }, { id: 'distil-whisper-old', active: false }] });
    });
    assert.deepEqual(await listModels(configured()), ['whisper-large-v3-turbo', 'whisper-large-v3']);
});

test('Groq discovery also accepts future ASR models explicitly marked for the transcription endpoint', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [
        { id: 'new-asr', task: 'automatic-speech-recognition' },
        { id: 'new-transcriber', supported_endpoints: ['/audio/transcriptions'] },
        { id: 'audio-chat', supported_endpoints: ['/chat/completions'] },
        { id: 'disabled-asr', task: 'transcription', active: false },
    ] }));
    assert.deepEqual(await listModels(configured()), ['new-asr', 'new-transcriber']);
});
