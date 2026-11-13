// Exercise extension reload and missing receivers with simulated external services.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.join(root, 'test-results');
await mkdir(workspace, { recursive: true });
assert.equal(await realpath(workspace), path.join(await realpath(root), 'test-results'));
const profile = await mkdtemp(path.join(workspace, 'connection-browser-'));
const counts = { extracts: 0, transcriptions: 0 };
let holdProvider = false, releaseProvider, providerArrived;
const server = createServer(async (req, res) => {
    for await (const chunk of req) { /* drain request */ }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') return res.end('{}');
    if (req.url === '/jobs/extract') {
        counts.extracts++;
        return res.end(JSON.stringify({ id: 'job', state: 'ready', chunks: [{ index: 0, offset: 0, duration: 2 }] }));
    }
    if (req.url === '/jobs/job/chunks/0') { res.setHeader('Content-Type', 'audio/mpeg'); return res.end('audio'); }
    if (req.url === '/jobs/job' && req.method === 'DELETE') return res.end('{}');
    if (req.url === '/v1/audio/transcriptions') {
        counts.transcriptions++;
        if (holdProvider) {
            providerArrived();
            await new Promise(resolve => { releaseProvider = resolve; });
        }
        return res.end(JSON.stringify({ segments: [{ start: .1, end: 1, text: 'Connection recovered' }] }));
    }
    res.statusCode = 404; res.end('{}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let context;
try {
    context = await chromium.launchPersistentContext(profile, { locale: 'en-US',
        headless: true,
        ...(process.env.BUTTERCUP_BROWSER ? { executablePath: process.env.BUTTERCUP_BROWSER } : { channel: 'chromium' }),
        args: [`--disable-extensions-except=${path.join(root, 'dist', 'chromium')}`, `--load-extension=${path.join(root, 'dist', 'chromium')}`],
    });
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    await worker.evaluate(async address => {
        await chrome.storage.local.set({ settings: { provider: 'custom', baseUrl: address + '/v1', backendUrl: address,
            model: 'test', backendToken: 'LOCAL_TEST_TOKEN', preferHuman: false } });
    }, address);
    await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: `
        <div id="movie_player"><video></video><div class="ytp-right-controls"></div></div><script>
        document.getElementById('movie_player').getPlayerResponse = () => ({ videoDetails: {videoId:'abcdefghijk'} });
        </script>` }));
    const youtube = await context.newPage();
    await youtube.goto('https://www.youtube.com/watch?v=abcdefghijk');
    await youtube.waitForSelector('#buttercup-button');
    // Older builds had an unguarded timer and no dispose hook. Keep that
    // behavior alive across reload to detect duplicate player controls.
    await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
            globalThis.__buttercupContent.dispose();
            let button;
            const attach = () => {
                const controls = document.querySelector('.ytp-right-controls');
                if (button?.parentElement === controls) return;
                button = document.createElement('button'); button.id = 'buttercup-button';
                button.textContent = 'Legacy BC'; controls.prepend(button);
            };
            attach(); setInterval(attach, 1000);
        } });
    });
    let popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    // Keep the YouTube document open: extension reload does not reinject its scripts.
    const restarted = context.waitForEvent('serviceworker');
    await popup.evaluate(() => chrome.runtime.reload()).catch(() => {});
    worker = await restarted;
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const tabId = await popup.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/*' }))[0].id);
    const started = await popup.evaluate(tabId => chrome.runtime.sendMessage({ type: 'GENERATE', tabId }), tabId);
    assert.equal(started.ok, true, JSON.stringify(started));
    async function finished() {
        let status;
        for (let i = 0; i < 100; i++) {
            status = await popup.evaluate(async tabId => (await chrome.storage.session.get(`status-${tabId}`))[`status-${tabId}`], tabId);
            if (['ready', 'error'].includes(status?.stage)) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.equal(status?.stage, 'ready', JSON.stringify(status));
    }
    await finished();
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(await youtube.locator('#buttercup-button').count(), 1);
    assert.equal(await youtube.evaluate(() => [...document.querySelector('video').textTracks].filter(track => track.mode === 'showing').length), 1);
    assert.deepEqual(counts, { extracts: 1, transcriptions: 1 });
    // Lose the content listener while a transcription request is in flight.
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'CACHE_CLEAR' }));
    await popup.evaluate(tabId => chrome.storage.session.remove(`status-${tabId}`), tabId);
    holdProvider = true;
    const arriving = new Promise(resolve => { providerArrived = resolve; });
    assert.equal((await popup.evaluate(tabId => chrome.runtime.sendMessage({ type: 'GENERATE', tabId }), tabId)).ok, true);
    await arriving;
    await worker.evaluate(tabId => chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.__buttercupContent.dispose() }), tabId);
    releaseProvider();
    await finished();
    assert.deepEqual(counts, { extracts: 2, transcriptions: 2 }, 'Reconnect must not call the provider again');
    assert.equal(await youtube.locator('#buttercup-button').count(), 1);
    assert.equal(await youtube.evaluate(() => {
        const tracks = [...document.querySelector('video').textTracks];
        return tracks.length === 1 && tracks[0].cues.length === 1 && tracks[0].mode === 'showing';
    }), true, 'Reconnect must reuse the native track without duplicate cues');
    // A missing offscreen document is recreated, with the cached result intact.
    await worker.evaluate(() => chrome.offscreen.closeDocument());
    await popup.evaluate(tabId => chrome.storage.session.remove(`status-${tabId}`), tabId);
    assert.equal((await popup.evaluate(tabId => chrome.runtime.sendMessage({ type: 'GENERATE', tabId }), tabId)).ok, true);
    await finished();
    assert.deepEqual(counts, { extracts: 2, transcriptions: 2 });
    // Current content scripts reconnect without reloading the video. An old
    // renderer's cleanup must not erase cues delivered by the new instance.
    const documentStarted = await youtube.evaluate(() => performance.timeOrigin);
    const nextWorker = context.waitForEvent('serviceworker');
    await popup.evaluate(() => chrome.runtime.reload()).catch(() => {});
    worker = await nextWorker;
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.evaluate(tabId => chrome.storage.session.remove(`status-${tabId}`), tabId);
    assert.equal((await popup.evaluate(tabId => chrome.runtime.sendMessage({ type: 'GENERATE', tabId }), tabId)).ok, true);
    await finished();
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(await youtube.evaluate(() => performance.timeOrigin), documentStarted, 'Current scripts must reconnect without refreshing YouTube');
    assert.equal(await youtube.evaluate(() => {
        const tracks = [...document.querySelector('video').textTracks];
        return tracks.length === 1 && tracks[0].cues.length === 1 && tracks[0].mode === 'showing';
    }), true, 'A disposed renderer must not erase the new captions');
    assert.deepEqual(counts, { extracts: 2, transcriptions: 2 });
    await writeFile(path.join(workspace, 'browser-connection.json'), JSON.stringify({ passed: true, browser: await context.browser()?.version(), counts, externalServices: 'simulated' }, null, 2));
    console.log('Connection recovery passed: extension reload, receiver lost during transcription, offscreen recreation; no repeated provider calls or duplicate cues.');
} finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    if (path.dirname(profile) === workspace) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
