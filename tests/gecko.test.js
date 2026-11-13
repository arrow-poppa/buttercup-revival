import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { settingsStorage } from '../gecko/storage.js';

test('Gecko keeps secrets outside browser storage and preserves concurrent field edits', async t => {
    const previous = { indexedDB: globalThis.indexedDB, chrome: globalThis.chrome };
    globalThis.indexedDB = indexedDB;
    const notifications = [];
    globalThis.chrome = { storage: { local: { set: async data => notifications.push(data) } } };
    t.after(() => Object.assign(globalThis, previous));
    await Promise.all([
        settingsStorage.set({ 'draftSetting:apiKey': 'SYNTHETIC_SECRET', 'draftSetting:model': 'test/model' }),
        settingsStorage.set({ 'draftSetting:language': 'ja' }),
    ]);
    const saved = await settingsStorage.get(['draftSetting:apiKey', 'draftSetting:model', 'draftSetting:language']);
    assert.deepEqual(saved, { 'draftSetting:apiKey': 'SYNTHETIC_SECRET', 'draftSetting:model': 'test/model', 'draftSetting:language': 'ja' });
    assert.equal(notifications.length, 2);
    assert.notEqual(notifications[0]['draftSetting:revision'], notifications[1]['draftSetting:revision']);
    assert.deepEqual(Object.keys(notifications[0]), ['draftSetting:revision']);
    assert.ok(!JSON.stringify(notifications).includes('SYNTHETIC_SECRET'));
    await settingsStorage.set({ settings: { apiKey: 'ACTIVE_SYNTHETIC_SECRET' } });
    assert.equal(notifications.length, 2, 'Activating settings must not trigger a storage event loop');
    assert.deepEqual(await settingsStorage.get('settings'), { settings: { apiKey: 'ACTIVE_SYNTHETIC_SECRET' } });
});
