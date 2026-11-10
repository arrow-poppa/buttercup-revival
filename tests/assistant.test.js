import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateSettings } from '../api/config.js';
import { draftSettings, formDraft } from '../api/settings.js';
import { assistantStatus, startAssistant } from '../api/assistant.js';

test('DeepInfra and Groq ignore incomplete inactive URL/header drafts without losing them', () => {
    for (const provider of ['deepinfra', 'groq']) {
        const draft = { ...formDraft({ ...DEFAULTS, provider }), baseUrl: 'not a URL', extraHeaders: '{',
            asbplayerUrl: 'unfinished', communityUrl: 'unfinished' };
        const settings = draftSettings(draft);
        assert.equal(settings.baseUrl, 'not a URL');
        assert.deepEqual(settings.extraHeaders, {});
        assert.equal(draft.extraHeaders, '{');
        assert.throws(() => draftSettings({ ...draft, provider: 'custom', extraHeaders: '{}' }), /Endereço da Custom API inválido/);
        assert.throws(() => draftSettings({ ...draft, autoSend: true }), /Endereço do asbplayer inválido/);
        assert.throws(() => draftSettings({ ...draft, communityRead: true }), /Endereço do cache comunitário inválido/);
    }
    assert.equal(validateSettings({ backendUrl: '', asbplayerUrl: '' }).backendUrl, DEFAULTS.backendUrl);
    assert.throws(() => validateSettings({ backendUrl: 'wrong' }), /Endereço do assistente local inválido/);
});

test('local status works independently of incomplete provider settings and gives a pairing hint', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, DEFAULTS.backendUrl + '/health');
        assert.deepEqual(options.headers, { Authorization: 'Bearer LOCAL_KEY' });
        return Response.json({ status: 'ok', version: '0.2.0', ffmpeg: true, ffprobe: true, js_runtime_available: true });
    });
    assert.equal((await assistantStatus({ backendToken: 'LOCAL_KEY', model: '', baseUrl: 'wrong' })).state, 'online');
    assert.equal((await assistantStatus({})).state, 'pair');
    assert.equal((await assistantStatus({ backendUrl: 'bad' })).state, 'offline');
});

test('local status explains stopped, unpaired and incomplete services', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
    assert.match((await assistantStatus({ backendToken: 'LOCAL_KEY' })).message, /Iniciar e conectar/);
    fetch.mock.mockImplementation(async () => Response.json({}, { status: 401 }));
    assert.match((await assistantStatus({ backendToken: 'LOCAL_KEY' })).message, /reconectado/);
    fetch.mock.mockImplementation(async () => Response.json({ status: 'ok', version: '0.2.0', ffmpeg: false }));
    assert.equal((await assistantStatus({ backendToken: 'LOCAL_KEY' })).state, 'dependencies');
});

test('native startup accepts only a local connection and does not send credentials or arbitrary commands', async () => {
    const settings = await startAssistant(async message => {
        assert.deepEqual(message, { action: 'start' });
        return { ok: true, backendUrl: DEFAULTS.backendUrl, backendToken: 'x'.repeat(40) };
    });
    assert.deepEqual(settings, { backendUrl: DEFAULTS.backendUrl, backendToken: 'x'.repeat(40) });
    await assert.rejects(startAssistant(async () => ({ ok: true, backendUrl: 'https://outside.example', backendToken: 'x'.repeat(40) })), /Local services/);
    await assert.rejects(startAssistant(async () => ({ ok: true, backendToken: 'short' })), /conexão inválida/);
    await assert.rejects(startAssistant(async () => { throw new Error('host missing'); }), /Install Buttercup/);
});
