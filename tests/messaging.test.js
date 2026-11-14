import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, audioProfileKey } from '../api/config.js';
import { DRAFT_PREFIX } from '../api/settings.js';
import { request, saveDraftWithWorker } from '../api/messaging.js';

function setup(t, sendMessage, data = { settings: { ...DEFAULTS, openrouterMode: 'chat', openrouterProvider: 'groq' } }) {
    const previous = globalThis.chrome;
    globalThis.chrome = { runtime: { sendMessage }, storage: { local: {
        async get(keys) { return Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])])); },
    } } };
    t.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
    return data;
}

test('settings use the stable SAVE command with the latest Chat Completions mode and provider pin', async t => {
    const calls = [];
    setup(t, async message => { calls.push(message); return { ok: true, data: message.settings }; });
    const result = await saveDraftWithWorker();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, 'SAVE');
    assert.equal(calls[0].useDraft, true);
    assert.equal(result.openrouterMode, 'chat');
    assert.equal(result.openrouterProvider, 'groq');
});
test('an older worker dropping the provider pin requires reload and cannot trigger another action', async t => {
    const calls = [];
    const data = setup(t, async message => { calls.push(message.type); return { ok: true, data: { ...DEFAULTS } }; }, {
        settings: { ...DEFAULTS }, [DRAFT_PREFIX + 'openrouterMode']: 'chat', [DRAFT_PREFIX + 'openrouterProvider']: 'groq',
    });
    await assert.rejects(saveDraftWithWorker(), error => error.code === 'BUTTERCUP_UPDATE_REQUIRED' && /Reload extension/.test(error.message));
    assert.deepEqual(calls, ['SAVE']);
    assert.equal(data[DRAFT_PREFIX + 'openrouterMode'], 'chat');
    assert.equal(data[DRAFT_PREFIX + 'openrouterProvider'], 'groq');
});
test('unknown worker actions show a reload instruction and never replay a potentially paid request', async t => {
    let calls = 0;
    setup(t, async () => { calls++; return { ok: false, error: 'Unknown Buttercup action' }; });
    await assert.rejects(request({ type: 'PROVIDER_TEST' }), error => error.code === 'BUTTERCUP_UPDATE_REQUIRED' && !error.message.includes('Unknown Buttercup action'));
    assert.equal(calls, 1);
});

test('a missing worker gives an actionable reload control without replaying a paid request', async t => {
    let calls = 0;
    setup(t, async () => { calls++; throw new Error('Could not establish connection. Receiving end does not exist.'); });
    await assert.rejects(request({ type: 'PROVIDER_TEST' }), error => error.code === 'BUTTERCUP_UPDATE_REQUIRED');
    assert.equal(calls, 1);
});

test('an older worker dropping original audio requires reload before generation', async t => {
    setup(t, async message => ({ ok: true, data: { ...message.settings, audioTrack: undefined } }), {
        settings: { ...DEFAULTS, audioTrack: 'original' },
    });
    await assert.rejects(saveDraftWithWorker(), error => error.code === 'BUTTERCUP_UPDATE_REQUIRED');
});

test('an older worker dropping FLAC preferences requires reload before generation', async t => {
    setup(t, async message => ({ ok: true, data: { ...message.settings, audioFormatProfiles: undefined } }), {
        settings: { ...DEFAULTS, audioFormatProfiles: { [audioProfileKey(DEFAULTS)]: 'flac' } },
    });
    await assert.rejects(saveDraftWithWorker(), error => error.code === 'BUTTERCUP_UPDATE_REQUIRED');
});

test('an older worker dropping whole-audio or parallel mode requires reload before any upload', async t => {
    setup(t, async message => ({ ok: true, data: { ...message.settings, audioMode: undefined, parallelRequests: undefined } }), {
        settings: { ...DEFAULTS, audioMode: 'whole', parallelRequests: 2 },
    });
    await assert.rejects(saveDraftWithWorker(), error => error.code === 'BUTTERCUP_UPDATE_REQUIRED');
});

test('a worker dropping strict no-fallback mode blocks generation until reload', async t => {
    setup(t, async message => ({ ok: true, data: { ...message.settings, openrouterNoFallback: undefined } }), {
        settings: { ...DEFAULTS, openrouterMode: 'chat', openrouterProvider: 'deepinfra', openrouterNoFallback: true },
    });
    await assert.rejects(saveDraftWithWorker(), error => error.code === 'BUTTERCUP_UPDATE_REQUIRED');
});
test('a concurrent pin change refreshes only the idempotent settings save', async t => {
    const calls = [];
    let data;
    data = setup(t, async message => {
        calls.push(message.type);
        if (calls.length === 1) data[DRAFT_PREFIX + 'openrouterProvider'] = 'deepinfra';
        return { ok: true, data: message.settings };
    });
    const applied = await saveDraftWithWorker();
    assert.deepEqual(calls, ['SAVE', 'SAVE']);
    assert.equal(applied.openrouterMode, 'chat');
    assert.equal(applied.openrouterProvider, 'deepinfra');
});
