import test from 'node:test';
import assert from 'node:assert/strict';
import { connections, OFFSCREEN_PROTOCOL } from '../background/connections.js';

const noReceiver = () => new Error('Could not establish connection. Receiving end does not exist.');
const ready = { ready: true, version: 'test', videoId: 'abcdefghijk' };
function fixture() {
    return {
        runtime: { getManifest: () => ({ version: 'test' }), sendMessage: async () => ({ ready: true, protocol: OFFSCREEN_PROTOCOL }) },
        offscreen: { hasDocument: async () => false, createDocument: async () => {} },
        tabs: { get: async () => ({ url: 'https://www.youtube.com/watch?v=abcdefghijk' }), sendMessage: async () => ready },
        scripting: { executeScript: async () => {} },
    };
}

test('concurrent offscreen requests share creation and wait for the receiver before sending each action once', async () => {
    const api = fixture(), actions = [];
    let created = 0, probes = 0, exists = false;
    api.offscreen.hasDocument = async () => exists;
    api.offscreen.createDocument = async () => { created++; exists = true; };
    api.runtime.sendMessage = async message => {
        if (message.type === 'BUTTERCUP_READY') {
            if (++probes < 3) throw noReceiver();
            return { ready: true, protocol: OFFSCREEN_PROTOCOL };
        }
        actions.push(message.type);
        return { ok: true };
    };
    const link = connections(api);
    await Promise.all([link.sendOffscreen({ type: 'RUN' }), link.sendOffscreen({ type: 'PROVIDER_TEST' })]);
    assert.equal(created, 1);
    assert.equal(probes, 3);
    assert.deepEqual(actions.sort(), ['PROVIDER_TEST', 'RUN']);
});

test('a lost response to a paid operation is never replayed', async () => {
    const api = fixture();
    let requests = 0;
    api.runtime.sendMessage = async message => {
        if (message.type === 'BUTTERCUP_READY') return { ready: true, protocol: OFFSCREEN_PROTOCOL };
        requests++;
        throw noReceiver();
    };
    await assert.rejects(connections(api).sendOffscreen({ type: 'PROVIDER_TEST' }), /connection.*closed/);
    assert.equal(requests, 1);
});

test('an incompatible offscreen process blocks actions without closing or restarting it', async () => {
    const api = fixture();
    api.offscreen.hasDocument = async () => true;
    api.offscreen.createDocument = async () => assert.fail('Do not replace an existing process');
    api.runtime.sendMessage = async message => {
        assert.equal(message.type, 'BUTTERCUP_READY');
        return { ready: true, protocol: -1 };
    };
    await assert.rejects(connections(api).sendOffscreen({ type: 'RUN' }), /Reload the extension/);
});

test('concurrent reconnects inject once and healthy content is left running', async () => {
    const api = fixture();
    let attached = false, injections = 0;
    api.tabs.sendMessage = async () => { if (!attached) throw noReceiver(); return ready; };
    api.scripting.executeScript = async options => {
        if (options.func) return [{ result: false }];
        assert.deepEqual(options.files, ['buttercup.js', 'content.js']);
        injections++; attached = true;
    };
    const link = connections(api);
    await Promise.all([link.content(1, 'abcdefghijk'), link.content(1, 'abcdefghijk')]);
    await link.content(1, 'abcdefghijk');
    assert.equal(injections, 1);
});

test('subtitle delivery recovers a receiver lost after readiness without starting transcription', async () => {
    const api = fixture();
    let attached = true, attempts = 0, injections = 0;
    api.tabs.sendMessage = async (tabId, message) => {
        if (!attached) throw noReceiver();
        if (message.type === 'BUTTERCUP_READY') return ready;
        assert.equal(message.type, 'SUBTITLES');
        if (++attempts === 1) { attached = false; throw noReceiver(); }
        return { received: true };
    };
    api.scripting.executeScript = async options => { if (options.func) return [{ result: false }]; attached = true; injections++; };
    const result = await connections(api).deliver(1, { type: 'SUBTITLES', videoId: 'abcdefghijk' });
    assert.equal(result.received, true);
    assert.equal(injections, 1);
    assert.equal(attempts, 2);
});

test('recovery never injects into other origins or delivers to a different video', async () => {
    const api = fixture();
    api.scripting.executeScript = async () => assert.fail('Do not inject');
    await assert.rejects(connections(api).content(1, 'lmnopqrstuv'), /video changed/);
    api.tabs.get = async () => ({ url: 'https://example.com/watch?v=abcdefghijk' });
    await assert.rejects(connections(api).content(1), /YouTube video first/);
});

test('legacy controls trigger one page reload to remove orphaned handlers before generation', async () => {
    const api = fixture();
    let attached = false, reloads = 0;
    api.tabs.sendMessage = async () => { if (!attached) throw noReceiver(); return ready; };
    api.scripting.executeScript = async options => {
        assert.equal(typeof options.func, 'function');
        return [{ result: true }];
    };
    api.tabs.reload = async () => { reloads++; attached = true; };
    const link = connections(api);
    await link.content(1, 'abcdefghijk');
    await link.content(1, 'abcdefghijk');
    assert.equal(reloads, 1);
});
