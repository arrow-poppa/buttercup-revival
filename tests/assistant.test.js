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
        assert.throws(() => draftSettings({ ...draft, provider: 'custom', extraHeaders: '{}' }), /Custom API address is invalid/);
        assert.throws(() => draftSettings({ ...draft, autoSend: true }), /asbplayer address is invalid/);
        assert.throws(() => draftSettings({ ...draft, communityRead: true }), /Community cache address is invalid/);
    }
    assert.equal(validateSettings({ backendUrl: '', asbplayerUrl: '' }).backendUrl, DEFAULTS.backendUrl);
    assert.throws(() => validateSettings({ backendUrl: 'wrong' }), /Local assistant address is invalid/);
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
    assert.match((await assistantStatus({ backendToken: 'LOCAL_KEY' })).message, /Start and connect/);
    fetch.mock.mockImplementation(async () => Response.json({}, { status: 401 }));
    assert.match((await assistantStatus({ backendToken: 'LOCAL_KEY' })).message, /reconnected/);
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
    await assert.rejects(startAssistant(async () => ({ ok: true, backendToken: 'short' })), /invalid connection/);
    await assert.rejects(startAssistant(async () => { throw new Error('host missing'); }), /Install Buttercup/);
});

test('manual connection imports only an exact profile and a loopback connection', async () => {
    const { importConnection } = await import('../api/assistant.js');
    const origin = 'moz-extension://12345678-1234-1234-1234-123456789abc';
    const data = { app: 'buttercup-connection', origin, backendUrl: DEFAULTS.backendUrl, backendToken: 'SYNTHETIC_LOCAL_TOKEN_'.repeat(2) };
    assert.equal(importConnection(data, origin).backendToken, data.backendToken);
    for (const changed of [{origin:'https://evil.example'}, {app:'other'}, {backendToken:'short'}, {backendUrl:'https://evil.example'}]) {
        assert.throws(()=>importConnection({...data,...changed},origin));
    }
});
