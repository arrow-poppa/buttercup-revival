import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateSettings, isChat, isOpenRouter, providerBaseUrl, redact } from '../api/config.js';
import { transcribe, listModels } from '../api/provider.js';
import { processVideo } from '../api/transcription.js';
import { normalize, formatTranscript } from '../subtitles/formats.js';

const settings = () => validateSettings({ provider: 'deepinfra', deepinfraApiKey: 'DEEPINFRA_TEST_KEY',
    apiKey: 'OPENROUTER_TEST_KEY', backendToken: 'LOCAL_TEST_TOKEN', customMode: 'chat',
    customProvider: 'other', openrouterMode: 'chat', openrouterProvider: 'other', openrouterNoFallback: true,
    extraHeaders: { 'X-Private-Custom': 'CUSTOM_SECRET' } });

test('DeepInfra uses native Whisper ASR and only its own key, regardless of inactive routing preferences', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo');
        assert.deepEqual(options.headers, { Authorization: 'Bearer DEEPINFRA_TEST_KEY' });
        assert.equal(await options.body.get('audio').text(), 'test audio');
        assert.equal(options.body.get('task'), 'transcribe');
        assert.equal(options.body.get('chunk_level'), 'word');
        assert.equal(options.body.get('language'), 'pt');
        assert.equal(options.body.get('initial_prompt'), 'Buttercup');
        for (const field of ['file', 'model', 'provider', 'response_format', 'timestamp_granularities[]']) assert.equal(options.body.has(field), false);
        assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
        return Response.json({ language: 'pt', words: [{ start: .1, end: .5, text: 'Olá' }, { start: .5, end: 1, text: 'mundo' }],
            segments: [{ start: .1, end: 1, text: 'Olá mundo' }] });
    });
    const configured = { ...settings(), language: 'pt', prompt: 'Buttercup' };
    assert.equal(isChat(configured), false); assert.equal(isOpenRouter(configured), false);
    assert.equal(providerBaseUrl(configured), 'https://api.deepinfra.com/v1/inference');
    const transcript = normalize(await transcribe(configured, new Blob(['test audio'], { type: 'audio/mpeg' })));
    assert.deepEqual(formatTranscript(transcript, { ...configured, wordsPerLine: 1 }), [
        { start: .1, end: .5, text: 'Olá' }, { start: .5, end: 1, text: 'mundo' },
    ]);
    assert.equal(fetch.mock.callCount(), 1);
});

test('DeepInfra can request segment timing and never retries or switches provider on error', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.ok(url.startsWith('https://api.deepinfra.com/v1/inference/'));
        assert.equal(options.body.get('chunk_level'), 'segment');
        return Response.json({ error: 'Unavailable DEEPINFRA_TEST_KEY OPENROUTER_TEST_KEY' }, { status: 503 });
    });
    await assert.rejects(transcribe({ ...settings(), wordTimestamps: false }, new Blob(['audio'])), error => {
        assert.match(error.message, /DeepInfra HTTP 503/);
        assert.doesNotMatch(error.message, /DEEPINFRA_TEST_KEY|OPENROUTER_TEST_KEY/);
        return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
});

test('DeepInfra requires its own key before extraction and rejects model provider suffixes before upload', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('No network request allowed'));
    const configured = { ...settings(), deepinfraApiKey: '', cache: false };
    await assert.rejects(transcribe(configured, new Blob(['audio'])), /DeepInfra API key/);
    await assert.rejects(processVideo('abcdefghijk', configured, new AbortController().signal, () => {}), /DeepInfra API key/);
    await assert.rejects(transcribe({ ...settings(), deepinfraModel: 'openai/whisper-large-v3-turbo:deepinfra' }, new Blob(['audio'])), /without a provider suffix/);
    assert.equal(fetch.mock.callCount(), 0);
    assert.doesNotMatch(redact('DEEPINFRA_TEST_KEY OPENROUTER_TEST_KEY', settings()), /DEEPINFRA_TEST_KEY|OPENROUTER_TEST_KEY/);
});

test('DeepInfra model discovery uses the public ASR catalog without any credentials', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.deepinfra.com/models/list');
        assert.equal(options.headers, undefined);
        return Response.json([
            { type: 'automatic-speech-recognition', model_name: 'openai/whisper-large-v3-turbo' },
            { type: 'automatic-speech-recognition', model_name: 'Qwen/Qwen3-ASR-1.7B' },
            { type: 'automatic-speech-recognition', model_name: 'mistralai/Voxtral-Mini-3B-2507' },
            { type: 'automatic-speech-recognition', model_name: 'nvidia/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B' },
            { type: 'text-generation', model_name: 'text/model' },
            { type: 'automatic-speech-recognition', model_name: 'old/model', deprecated: 123 },
        ]);
    });
    assert.deepEqual(await listModels(settings()), ['openai/whisper-large-v3-turbo', 'Qwen/Qwen3-ASR-1.7B', 'mistralai/Voxtral-Mini-3B-2507', 'nvidia/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B']);
});

test('DeepInfra requests native word timing for Qwen, Voxtral and NVIDIA models without changing models on failure', async t => {
    let expected;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(decodeURIComponent(url), 'https://api.deepinfra.com/v1/inference/' + expected);
        assert.equal(options.body.get('chunk_level'), 'word');
        assert.equal(options.body.get('task'), 'transcribe');
        assert.equal(options.body.get('initial_prompt'), 'Aiko, Buttercup');
        return Response.json({ words: [{ start: .1, end: .8, word: 'caption' }] });
    });
    for (expected of ['Qwen/Qwen3-ASR-1.7B', 'Qwen/Qwen3-ASR-0.6B', 'mistralai/Voxtral-Mini-3B-2507',
        'mistralai/Voxtral-Small-24B-2507', 'nvidia/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B']) {
        const response = await transcribe({ ...settings(), deepinfraModel: expected, prompt: 'Aiko, Buttercup' }, new Blob(['audio']));
        assert.equal(formatTranscript(normalize(response), settings())[0].text, 'caption');
    }
});
