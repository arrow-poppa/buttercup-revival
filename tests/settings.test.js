import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, getSettings } from '../api/config.js';
import { formDraft, popupSettings, saveDraft, saveSettings, persistDraft, commitDraft } from '../api/settings.js';

function storage(t) {
    const data = {};
    const previous = globalThis.chrome;
    globalThis.chrome = { storage: { local: {
        async get(key) { return structuredClone(Object.fromEntries((Array.isArray(key) ? key : [key]).map(name => [name, data[name]]))); },
        async set(value) { Object.assign(data, structuredClone(value)); },
    } } };
    t.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
    return data;
}

test('autosave survives popup recreation without an explicit save and preserves typed IDs', async t => {
    storage(t);
    const draft = formDraft({ ...DEFAULTS, provider: 'custom', baseUrl: 'https://custom.example/v1',
        customMode: 'chat', customProvider: 'manual-provider/region-a', model: 'typed/model-not-in-catalog',
        apiKey: 'PRIVATE_KEY', backendToken: 'LOCAL_TOKEN', enabled: false });
    // The popup may disappear before it can consume this response.
    const pending = saveDraft(draft);
    const reopened = await popupSettings();
    assert.equal((await pending).saved, true);
    assert.deepEqual(reopened.draft, draft);
    assert.equal((await getSettings()).customProvider, 'manual-provider/region-a');
    assert.equal(reopened.settings.model, 'typed/model-not-in-catalog');
    assert.equal(reopened.settings.enabled, false);
});

test('switching DeepInfra and OpenRouter preserves independent keys and models across popup recreation', async t => {
    storage(t);
    await saveSettings({ provider: 'openrouter', apiKey: 'OPENROUTER_KEY', model: 'openai/whisper-large-v3',
        deepinfraApiKey: 'DEEPINFRA_KEY', deepinfraModel: 'openai/whisper-large-v3-turbo', groqApiKey: 'GROQ_KEY', groqModel: 'whisper-large-v3' });
    await persistDraft({ provider: 'deepinfra' });
    const direct = await commitDraft();
    assert.equal(direct.provider, 'deepinfra'); assert.equal(direct.deepinfraApiKey, 'DEEPINFRA_KEY');
    assert.equal((await popupSettings()).draft.apiKey, 'OPENROUTER_KEY');
    await persistDraft({ provider: 'groq' });
    const groq = await commitDraft();
    assert.equal(groq.provider, 'groq'); assert.equal(groq.groqApiKey, 'GROQ_KEY'); assert.equal(groq.groqModel, 'whisper-large-v3');
    assert.equal(groq.deepinfraApiKey, 'DEEPINFRA_KEY');
    await persistDraft({ provider: 'openrouter' });
    const router = await commitDraft();
    assert.equal(router.apiKey, 'OPENROUTER_KEY'); assert.equal(router.model, 'openai/whisper-large-v3');
    assert.equal(router.deepinfraApiKey, 'DEEPINFRA_KEY'); assert.equal(router.deepinfraModel, 'openai/whisper-large-v3-turbo');
    assert.equal(router.groqApiKey, 'GROQ_KEY'); assert.equal(router.groqModel, 'whisper-large-v3');
});

test('unfinished fields and credentials are restored while active settings remain valid', async t => {
    storage(t);
    await saveSettings({ model: 'previous/model', apiKey: 'PREVIOUS_KEY' });
    const draft = { ...formDraft({ ...DEFAULTS, model: 'previous/model' }), model: '',
        extraHeaders: '{"X-Example":', chunkSeconds: '', apiKey: 'NEW_PRIVATE_KEY' };
    assert.equal((await saveDraft(draft)).saved, false);
    const reopened = await popupSettings();
    assert.equal(reopened.draft.model, '');
    assert.equal(reopened.draft.extraHeaders, '{"X-Example":');
    assert.equal(reopened.draft.chunkSeconds, '');
    assert.equal(reopened.draft.apiKey, 'NEW_PRIVATE_KEY');
    assert.equal(reopened.settings.model, 'previous/model');
    assert.equal(reopened.settings.apiKey, 'PREVIOUS_KEY');
    const corrected = { ...draft, model: 'corrected/model', extraHeaders: '{"X-Example":"test"}', chunkSeconds: '60' };
    assert.equal((await saveDraft(corrected)).saved, true);
    assert.equal((await getSettings()).apiKey, 'NEW_PRIVATE_KEY');
    assert.deepEqual((await getSettings()).extraHeaders, { 'X-Example': 'test' });
});

test('rapid edits and explicit saves are serialized so older writes cannot overwrite newer values', async t => {
    const data = storage(t);
    const drafts = ['first/model', 'second/model', 'latest/model'].map(model => formDraft({ ...DEFAULTS, model }));
    await Promise.all(drafts.map(saveDraft));
    assert.equal((await popupSettings()).settings.model, 'latest/model');
    const pending = saveDraft({ ...drafts[2], model: '' });
    const explicit = saveSettings({ model: 'explicit/model', customProvider: '' });
    await Promise.all([pending, explicit]);
    assert.equal(data.settings.model, 'explicit/model');
    assert.equal(data.settingsDraft.model, 'explicit/model');
    await assert.rejects(saveDraft({ model: 123 }), /Invalid settings draft/);
    assert.equal((await saveDraft(formDraft({ ...DEFAULTS, model: 'after-error/model' }))).saved, true);
});
test('invalid legacy settings can be opened and repaired without discarding keys or tokens', async t => {
    const data = storage(t);
    data.settings = { ...DEFAULTS, model: '', language: 'invalid-language-code', apiKey: 'KEEP_KEY', backendToken: 'KEEP_TOKEN' };
    await assert.rejects(getSettings());
    const stored = await popupSettings();
    assert.equal(stored.draft.model, '');
    assert.equal(stored.draft.language, 'invalid-language-code');
    assert.equal(stored.draft.apiKey, 'KEEP_KEY');
    assert.equal(stored.draft.backendToken, 'KEEP_TOKEN');
    const incomplete = await saveDraft({ ...stored.draft, language: 'pt' });
    assert.equal(incomplete.saved, false);
    const repaired = await saveDraft({ ...stored.draft, language: 'pt', model: 'repaired/model' });
    assert.equal(repaired.saved, true);
    assert.equal((await getSettings()).apiKey, 'KEEP_KEY');
    assert.equal((await getSettings()).backendToken, 'KEEP_TOKEN');
});
test('route and pinned provider are durable before the worker applies them, including Whisper chat settings', async t => {
    storage(t);
    await saveSettings({ model: 'openai/whisper-large-v3-turbo', apiKey: 'KEEP_KEY', backendToken: 'KEEP_TOKEN' });
    await persistDraft({ openrouterMode: 'chat', openrouterProvider: 'groq' });
    // No worker message or apply call is needed to restore the chosen fields.
    const reopened = await popupSettings();
    assert.equal(reopened.draft.openrouterMode, 'chat');
    assert.equal(reopened.draft.openrouterProvider, 'groq');
    assert.equal(reopened.draft.model, 'openai/whisper-large-v3-turbo');
    assert.equal((await getSettings()).openrouterMode, 'transcriptions');
    const active = await commitDraft();
    assert.equal(active.openrouterMode, 'chat');
    assert.equal(active.openrouterProvider, 'groq');
    assert.equal(active.apiKey, 'KEEP_KEY');
    assert.equal(active.backendToken, 'KEEP_TOKEN');
});
test('editing another field preserves an incomplete draft and its route/provider preferences', async t => {
    storage(t);
    await saveSettings({ model: 'previous/model' });
    assert.equal((await saveDraft({ model: '', customMode: 'chat', customProvider: 'custom-pin' })).saved, false);
    assert.equal((await saveDraft({ language: 'pt' })).saved, false);
    const reopened = await popupSettings();
    assert.equal(reopened.draft.model, '');
    assert.equal(reopened.draft.customMode, 'chat');
    assert.equal(reopened.draft.customProvider, 'custom-pin');
    await assert.rejects(commitDraft(), /Invalid model/);
    assert.equal((await getSettings()).model, 'previous/model');
});
test('committing after a delayed action uses the latest stored fields rather than an older popup snapshot', async t => {
    storage(t);
    await saveSettings({ model: 'typed/model', provider: 'custom', baseUrl: 'https://custom.example/v1' });
    const olderPopup = await popupSettings();
    assert.equal(olderPopup.draft.customMode, 'transcriptions');
    await persistDraft({ customMode: 'chat', customProvider: 'custom-pin' });
    // An unrelated edit in an older popup must not replace the route or provider.
    await persistDraft({ language: 'pt' });
    const latest = await commitDraft();
    assert.equal(latest.customMode, 'chat');
    assert.equal(latest.customProvider, 'custom-pin');
    assert.equal(latest.language, 'pt');
    assert.equal((await popupSettings()).draft.customMode, 'chat');
});

test('a settings backup round-trips what was typed and leaves the local pairing out', async () => {
    const { exportDraft, importDraft, formDraft } = await import('../api/settings.js');
    const draft = { ...formDraft(DEFAULTS), provider: 'deepinfra', deepinfraApiKey: 'PRIVATE_KEY', wordsPerLine: '7', showOnPlayer: false,
        saveFolder: 'G:\\Subtitles', model: '', backendToken: 'LOCAL_PAIRING_TOKEN', backendUrl: 'http://127.0.0.1:9000' };
    const file = JSON.parse(JSON.stringify(exportDraft(draft, '0.5.0')));
    assert.equal(file.app, 'buttercup-revival');
    assert.ok(!JSON.stringify(file).includes('LOCAL_PAIRING_TOKEN') && !('backendUrl' in file.settings));
    const patch = importDraft(file);
    assert.deepEqual(patch, Object.fromEntries(Object.entries(draft).filter(([key]) => !['backendToken', 'backendUrl'].includes(key))));
    // Unknown keys, wrong types and the pairing are ignored rather than stored.
    assert.deepEqual(importDraft({ app: 'buttercup-revival', settings: { wordsPerLine: 7, enabled: 'yes', other: 'x', backendToken: 'T', language: 'ja' } }), { language: 'ja' });
    for (const bad of [null, {}, { app: 'other', settings: { language: 'ja' } }, { app: 'buttercup-revival', settings: [] }, { app: 'buttercup-revival', settings: { other: 1 } }]) {
        assert.throws(() => importDraft(bad), /not a Buttercup settings file/);
    }
});
