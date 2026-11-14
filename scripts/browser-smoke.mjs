// Real Chromium extension test with simulated YouTube, extractor, provider and asbplayer.
// This deliberately does not claim to validate external services.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, mkdir, rm, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.join(root, 'test-results');
await mkdir(workspace, { recursive: true });
if (await realpath(workspace) !== path.join(await realpath(root), 'test-results')) throw new Error('Test artifacts must stay inside the project');
const profile = await mkdtemp(path.join(workspace, 'browser-'));
await mkdir(path.join(profile, 'Default'), { recursive: true });
await writeFile(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: workspace, prompt_for_download: false } }));
const extension = path.join(root, 'dist', 'chromium');
const counts = { extracts: 0, transcriptions: 0, deletes: 0, sends: 0 };
let chatRequests = 0;
let invalidChatTiming = false;
const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.end('{}'); return; }
    if (req.url === '/health') { res.end('{"status":"ok","version":"0.2.0","ffmpeg":true,"ffprobe":true,"js_runtime_available":true,"audio_track_selection":["default","original"]}'); return; }
    if (req.url === '/cookies/status') { res.end('{"imported":false}'); return; }
    if (req.url === '/jobs/extract') {
        counts.extracts++;
        assert.equal(req.headers.authorization, 'Bearer LOCAL_TEST_TOKEN');
        assert.equal(JSON.parse(body).video, 'abcdefghijk');
        res.end(JSON.stringify({ id: 'job', state: 'ready', audio_track: JSON.parse(body).audio_track || 'default', chunks: [{ index: 0, offset: 0, duration: 4 }] })); return;
    }
    if (req.url === '/jobs/job/chunks/0') { res.setHeader('Content-Type', 'audio/mpeg'); res.end('mock-audio'); return; }
    if (req.url === '/jobs/job' && req.method === 'DELETE') { counts.deletes++; res.end('{}'); return; }
    if (req.url === '/v1/chat/completions') {
        chatRequests++;
        assert.equal(req.headers.authorization, 'Bearer PROVIDER_TEST_KEY');
        const payload = JSON.parse(body);
        assert.deepEqual(payload.provider, { only: ['manual-provider/region-a'], allow_fallbacks: false });
        assert.equal(payload.model, 'manually/typed-model');
        assert.equal(Buffer.from(payload.messages[1].content[0].input_audio.data, 'base64').toString(), 'mock-audio');
        assert.ok(!body.includes(Buffer.from('LOCAL_TEST_TOKEN')));
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ language: 'pt', words: [{ start: .1, end: .1, word: 'Olá' }],
            segments: invalidChatTiming ? [] : [{ start: .1, end: 1, text: 'Olá mundo' }] }) } }] })); return;
    }
    if (req.url === '/v1/audio/transcriptions') {
        counts.transcriptions++;
        assert.equal(req.headers.authorization, 'Bearer PROVIDER_TEST_KEY');
        assert.ok(body.includes(Buffer.from('mock-audio')));
        assert.ok(!body.includes(Buffer.from('LOCAL_TEST_TOKEN')));
        res.end(JSON.stringify({ language: 'pt', words: [{ word: 'Olá', start: .1, end: .1 }, { word: 'mundo', start: .6, end: 1 }],
            segments: [{ start: .1, end: 1, text: 'Olá mundo' }] })); return;
    }
    if (req.url === '/v1/models') { res.end('{"data":[{"id":"typed/model-suggestion"}]}'); return; }
    if (req.url === '/asbplayer/load-subtitles') {
        counts.sends++;
        const payload = JSON.parse(body);
        assert.match(Buffer.from(payload.files[0].base64, 'base64').toString('utf8'), /Olá mundo/);
        res.writeHead(204); res.end(); return;
    }
    if (req.url === '/asbplayer/bound-media') { res.end('{"media":[]}'); return; }
    res.statusCode = 404; res.end('{}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.BUTTERCUP_BROWSER || undefined;
let context;
try {
    context = await chromium.launchPersistentContext(profile, { locale: 'en-US',
        headless: true, ...(executablePath ? { executablePath } : { channel: 'chromium' }),
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        acceptDownloads: true,
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    context.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://www.youtube.com/**', route => route.fulfill({
        contentType: 'text/html', body: `<!doctype html><html><body><div id="movie_player"><video></video><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button></div></div><script>
        window.originalFetch = window.fetch;
        window.originalXHR = window.XMLHttpRequest;
        const p = document.getElementById('movie_player');
        p.getPlayerResponse = () => ({ videoDetails: { videoId: new URL(location.href).searchParams.get('v'), title: 'Browser fixture' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [window.fixtureHuman ? {languageCode:'en'} : {kind:'asr'}], audioTracks: window.fixtureMultiAudio ? [{},{}] : [{}] } } });
        p.unloadModule = () => { window.captionsHidden = true; };
        p.loadModule = () => { window.captionsHidden = false; };
        </script></body></html>`,
    }));
    await page.goto('https://www.youtube.com/watch?v=abcdefghijk');
    await page.waitForSelector('#buttercup-button');
    let popup = await context.newPage();
    // A malformed setting from an older version must never lock the settings UI.
    await worker.evaluate(() => chrome.storage.local.set({ settings: {
        provider: 'custom', baseUrl: 'https://custom.example/v1', model: '', language: 'invalid-language-code',
        apiKey: 'RECOVERY_TEST_KEY', backendToken: 'RECOVERY_TEST_TOKEN',
    } }));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForFunction(() => document.getElementById('settings-status').textContent.includes('Draft restored.')
        || document.getElementById('status').textContent !== 'Ready');
    assert.equal(await popup.locator('[data-setting="provider"]').isEnabled(), true, 'A settings error must not disable all controls');
    await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    assert.equal(await popup.locator('[data-setting="apiKey"]').inputValue(), 'RECOVERY_TEST_KEY');
    assert.equal(await popup.locator('[data-setting="backendToken"]').inputValue(), 'RECOVERY_TEST_TOKEN');
    await popup.locator('[data-setting="language"]').fill('pt');
    await popup.locator('[data-setting="model"]').fill('repaired/model');
    await popup.locator('[data-setting="provider"]').selectOption('openrouter');
    await popup.locator('[data-setting="model"]').fill('openai/whisper-large-v3');
    await popup.waitForFunction(() => document.getElementById('settings-status').textContent === 'Settings saved automatically.');
    await popup.close();
    // Worker startup failures and missing replies must still leave fields usable.
    for (const failure of ['reject', 'timeout']) {
        const recovery = await context.newPage();
        await recovery.addInitScript(failure => {
            const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
            chrome.runtime.sendMessage = (message, ...args) => message.type === 'POPUP_SETTINGS'
                ? failure === 'reject' ? Promise.reject(new Error('Background unavailable')) : new Promise(() => {})
                : sendMessage(message, ...args);
        }, failure);
        await recovery.goto(`chrome-extension://${extensionId}/popup.html`);
        await recovery.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
        assert.equal(await recovery.locator('[data-setting="provider"]').isEnabled(), true);
        assert.equal(await recovery.locator('.save').isEnabled(), true);
        assert.equal(await recovery.locator('[data-setting="backendToken"]').inputValue(), 'RECOVERY_TEST_TOKEN');
        await recovery.locator('[data-setting="language"]').fill(failure === 'reject' ? 'en' : 'pt');
        await recovery.waitForFunction(() => document.getElementById('settings-status').textContent === 'Settings saved automatically.');
        await recovery.close();
    }
    // A lost worker save response must not discard the selected route or pin.
    const stalePopup = await context.newPage();
    await stalePopup.goto(`chrome-extension://${extensionId}/popup.html`);
    await stalePopup.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
    const interrupted = await context.newPage();
    await interrupted.addInitScript(() => {
        const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = (message, ...args) => ['SAVE', 'SAVE_DRAFT', 'APPLY_DRAFT'].includes(message.type)
            ? Promise.reject(new Error('Worker save interrupted')) : sendMessage(message, ...args);
    });
    await interrupted.goto(`chrome-extension://${extensionId}/popup.html`);
    await interrupted.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
    await interrupted.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    await interrupted.locator('[data-setting="openrouterMode"]').selectOption('chat');
    await interrupted.locator('[data-setting="openrouterProvider"]').fill('groq');
    await interrupted.close();
    // An older open form still displays Transcriptions. Saving it must commit
    // the newest durable choice instead of replacing it with that old snapshot.
    assert.equal(await stalePopup.locator('[data-setting="openrouterMode"]').inputValue(), 'transcriptions');
    await stalePopup.locator('.save').click();
    await stalePopup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    assert.equal(await stalePopup.locator('[data-setting="openrouterMode"]').inputValue(), 'chat');
    assert.equal(await stalePopup.locator('[data-setting="openrouterProvider"]').inputValue(), 'groq');
    await stalePopup.close();
    const restoredChoice = await context.newPage();
    await restoredChoice.goto(`chrome-extension://${extensionId}/popup.html`);
    await restoredChoice.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
    assert.equal(await restoredChoice.locator('[data-setting="openrouterMode"]').inputValue(), 'chat', 'Closing a popup after a worker failure must preserve Chat Completions');
    assert.equal(await restoredChoice.locator('[data-setting="openrouterProvider"]').inputValue(), 'groq');
    await restoredChoice.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    await restoredChoice.locator('[data-setting="openrouterMode"]').selectOption('transcriptions');
    await restoredChoice.close();
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    await popup.locator('#extension-id').filter({ hasText: extensionId }).waitFor();
    assert.equal(await popup.locator('#openrouter-routing').isVisible(), true);
    await popup.locator('[data-setting="openrouterMode"]').selectOption('chat');
    assert.equal(await popup.locator('#model-route-hint').isVisible(), true);
    assert.equal(await popup.locator('[data-setting="model"]').inputValue(), 'openai/whisper-large-v3');
    assert.equal(await popup.locator('#openrouter-routing').isVisible(), false);
    assert.equal(await popup.locator('#openrouter-chat-settings').isVisible(), true);
    await popup.locator('[data-setting="openrouterProvider"]').fill('groq');
    await popup.locator('[data-setting="model"]').fill('test/audio-chat');
    assert.equal(await popup.locator('#model-route-hint').isVisible(), false);
    // Close immediately, without Save, blur, or waiting for the autosave response.
    await popup.close();
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    await popup.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
    assert.equal(await popup.locator('[data-setting="openrouterMode"]').inputValue(), 'chat');
    assert.equal(await popup.locator('[data-setting="openrouterProvider"]').inputValue(), 'groq');
    assert.equal(await popup.locator('[data-setting="model"]').inputValue(), 'test/audio-chat');
    // An unfinished edit must also survive; it must not invalidate active settings.
    await popup.locator('[data-setting="model"]').fill('');
    await popup.locator('[data-setting="extraHeaders"]').fill('{"X-Example":');
    await popup.locator('[data-setting="chunkSeconds"]').fill('');
    await popup.locator('[data-setting="apiKey"]').fill('DRAFT_TEST_KEY');
    await popup.close();
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
    await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    assert.equal(await popup.locator('[data-setting="model"]').inputValue(), '');
    assert.equal(await popup.locator('[data-setting="extraHeaders"]').inputValue(), '{"X-Example":');
    assert.equal(await popup.locator('[data-setting="chunkSeconds"]').inputValue(), '');
    assert.equal(await popup.locator('[data-setting="apiKey"]').inputValue(), 'DRAFT_TEST_KEY');
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.model), 'test/audio-chat');
    await popup.locator('[data-setting="extraHeaders"]').fill('{}');
    await popup.locator('[data-setting="chunkSeconds"]').fill('120');
    await popup.locator('[data-setting="openrouterMode"]').selectOption('transcriptions');
    assert.equal(await popup.locator('[data-setting="openrouterProvider"]').inputValue(), '');
    await popup.locator('[data-setting="model"]').fill('openai/whisper-large-v3');
    await popup.locator('[data-setting="provider"]').selectOption('custom');
    assert.equal(await popup.locator('#openrouter-routing').isVisible(), false);
    await popup.locator('[data-setting="baseUrl"]').fill(address + '/v1');
    await popup.locator('[data-setting="apiKey"]').fill('PROVIDER_TEST_KEY');
    await popup.locator('[data-setting="backendUrl"]').fill(address);
    await popup.locator('[data-setting="backendToken"]').fill('LOCAL_TEST_TOKEN');
    await popup.locator('[data-setting="asbplayerUrl"]').fill(address);
    await popup.locator('[data-setting="autoSend"]').check();
    // Custom pinning accepts arbitrary typed IDs and survives popup recreation.
    await popup.locator('[data-setting="customMode"]').selectOption('chat');
    await popup.locator('[data-setting="customProvider"]').fill('manual-provider/region-a');
    await popup.locator('[data-setting="model"]').fill('manually/typed-model');
    await popup.close();
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html?view=sample#sample-test`);
    await popup.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
    await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    assert.equal(await popup.locator('#custom-settings').isVisible(), true);
    assert.equal(await popup.locator('[data-setting="customMode"]').inputValue(), 'chat');
    assert.equal(await popup.locator('[data-setting="customProvider"]').inputValue(), 'manual-provider/region-a');
    assert.equal(await popup.locator('[data-setting="model"]').inputValue(), 'manually/typed-model');
    await popup.locator('#sample').setInputFiles({ name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('mock-audio') });
    await popup.locator('#provider-test').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.startsWith('Compatible:'));
    assert.equal(chatRequests, 1);
    assert.match(await popup.locator('#status').textContent(), /word timestamps.*segment timestamps/i);
    invalidChatTiming = true;
    await popup.locator('#provider-test').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Invalid provider timestamps: words:'));
    assert.match(await popup.locator('#status').textContent(), /entry 1.*end must be greater than start/);
    assert.equal(await popup.locator('#provider-test').isEnabled(), true);
    assert.equal(chatRequests, 2);
    invalidChatTiming = false;
    await popup.locator('[data-setting="customMode"]').selectOption('transcriptions');
    await popup.locator('[data-setting="customProvider"]').fill('');
    await popup.locator('[data-setting="model"]').fill('openai/whisper-large-v3');
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    await popup.locator('#health').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Local assistant connected.');
    await popup.locator('#models').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('model suggestions found.'));
    assert.equal(await popup.locator('#model-list option').first().getAttribute('value'), 'typed/model-suggestion');
    await popup.locator('#asb-status').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'asbplayer server reachable.');
    await page.locator('#buttercup-button').click();
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.cues?.length > 0, null, { timeout: 15000 }).catch(async error => {
        console.log(JSON.stringify({ counts, errors, notice: await page.evaluate(() => document.getElementById('buttercup-notice')?.textContent),
            status: await popup.locator('#status').textContent(), contexts: await worker.evaluate(() => chrome.runtime.getContexts({})) }));
        throw error;
    });
    assert.equal(await page.evaluate(() => document.querySelector('video').textTracks[0].cues[0].text), 'Olá mundo');
    assert.equal(await page.evaluate(() => window.fetch === originalFetch && window.XMLHttpRequest === originalXHR), true);
    assert.equal(await page.evaluate(() => window.captionsHidden), true);
    await page.evaluate(async () => {
        const bytes = new Uint8Array(44 + 16000 * 2 * 2), view = new DataView(bytes.buffer);
        const string = (offset, text) => [...text].forEach((ch, i) => { bytes[offset + i] = ch.charCodeAt(0); });
        string(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); string(8, 'WAVE'); string(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        string(36, 'data'); view.setUint32(40, bytes.length - 44, true);
        const video = document.querySelector('video');
        const loaded = new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }));
        video.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        await loaded;
        const seeked = new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
        video.currentTime = .3; await seeked;
    });
    await page.waitForFunction(() => document.querySelector('video').textTracks[0].activeCues?.length === 1);
    await popup.waitForFunction(async () => Object.values(await chrome.storage.session.get(null))
        .some(value => value.stage === 'ready' && value.message.includes('Invalid word timestamps')));
    const completed = await popup.evaluate(async () => Object.values(await chrome.storage.session.get(null)).find(value => value.stage === 'ready'));
    assert.doesNotMatch(completed.message, /JSON|asbplayer failed/, 'An empty successful asbplayer reply must not add an error to ready subtitles');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.deepEqual(counts, { extracts: 1, transcriptions: 1, deletes: 1, sends: 1 });
    // Hiding BC is visual only: native cues/active timing remain available to
    // integrations, YouTube's caption source stays unchanged, and nothing is resent.
    await page.locator('#buttercup-button').click();
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.mode === 'hidden');
    assert.equal(await page.evaluate(() => document.querySelector('video').textTracks[0].cues.length), 1);
    assert.equal(await page.evaluate(() => document.querySelector('video').textTracks[0].activeCues.length), 1);
    assert.equal(await page.evaluate(() => window.captionsHidden), true);
    assert.deepEqual(counts, { extracts: 1, transcriptions: 1, deletes: 1, sends: 1 });
    await page.locator('#buttercup-button').click();
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.mode === 'showing');
    // The page cannot read chrome.storage.local secrets or extension configuration.
    assert.equal(await page.evaluate(() => typeof chrome?.storage), 'undefined');
    await page.evaluate(() => history.pushState({}, '', '/watch?v=lmnopqrstuv'));
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.mode === 'disabled');
    await page.evaluate(() => history.pushState({}, '', '/watch?v=abcdefghijk'));
    await new Promise(resolve => setTimeout(resolve, 1200));
    await page.locator('#buttercup-button').click();
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.mode === 'showing');
    assert.equal(await page.evaluate(() => document.querySelector('video').textTracks[0].cues.length), 1, 'SPA must remove cues before reusing a track');
    assert.equal(counts.transcriptions, 1, 'Second generation must use persistent cache');
    // With on-video captions off, loaded cues are hidden at once, and a new
    // generation still reaches asbplayer without appearing on the video.
    await popup.locator('[data-setting="showOnPlayer"]').uncheck();
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.mode === 'hidden');
    await page.evaluate(() => history.pushState({}, '', '/watch?v=lmnopqrstuv'));
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.mode === 'disabled');
    await page.evaluate(() => history.pushState({}, '', '/watch?v=abcdefghijk'));
    await new Promise(resolve => setTimeout(resolve, 1200));
    const sentBefore = counts.sends;
    await page.locator('#buttercup-button').click();
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.cues?.length === 1);
    assert.equal(await page.evaluate(() => document.querySelector('video').textTracks[0].mode), 'hidden', 'Captions must stay off the video');
    assert.equal(counts.sends, sentBefore + 1, 'asbplayer must still receive hidden subtitles');
    await popup.locator('[data-setting="showOnPlayer"]').check();
    await page.waitForFunction(() => document.querySelector('video').textTracks[0]?.mode === 'showing');
    await page.evaluate(() => { window.fixtureHuman = true; });
    const human = await popup.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
        return chrome.runtime.sendMessage({ type: 'GENERATE', tabId: tab.id });
    });
    assert.equal(human.ok, false); assert.match(human.error, /Human captions/);
    await page.evaluate(() => { window.fixtureHuman = false; window.fixtureMultiAudio = true; });
    const multi = await popup.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
        return chrome.runtime.sendMessage({ type: 'GENERATE', tabId: tab.id });
    });
    assert.equal(multi.ok, false); assert.match(multi.error, /Multiple audio/);
    await popup.locator('[data-setting="audioTrack"]').selectOption('original');
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    const original = await popup.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
        return chrome.runtime.sendMessage({ type: 'GENERATE', tabId: tab.id });
    });
    assert.equal(original.ok, true);
    await popup.waitForFunction(async () => Object.values(await chrome.storage.session.get(null)).some(value => value.stage === 'ready'));
    for (let i = 0; i < 50 && counts.deletes !== 2; i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(counts, { extracts: 2, transcriptions: 2, deletes: 2, sends: 4 });
    await page.evaluate(() => { window.fixtureMultiAudio = false; });
    // Request an export through the same popup route as the UI.
    await popup.locator('#track').selectOption({ index: 0 });
    const exported = await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'TRACKS', videoId: 'abcdefghijk' }));
    assert.equal(exported.ok, true); assert.equal(exported.data.length, 2);
    assert.equal(exported.data.filter(track => track.audioTrack === 'original').length, 1);
    // Playwright otherwise renames downloads to GUIDs in its temporary artifact folder.
    const downloads = await context.newCDPSession(page);
    await downloads.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
    const download = await popup.evaluate(async key => chrome.runtime.sendMessage({ type: 'EXPORT', key, format: 'srt' }), exported.data[0].key);
    assert.equal(download.ok, true); assert.equal(download.data.ok, true);
    let downloadInfo;
    for (let i = 0; i < 40; i++) {
        downloadInfo = await worker.evaluate(async () => (await chrome.downloads.search({ limit: 1, orderBy: ['-startTime'] }))[0]);
        if (downloadInfo?.state === 'complete') break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(/\[abcdefghijk\](___[^\\/]+)?\.srt$/.test(downloadInfo.filename), JSON.stringify(downloadInfo));
    assert.equal(path.resolve(path.dirname(downloadInfo.filename)), workspace);
    assert.match(await readFile(downloadInfo.filename, 'utf8'), /Olá mundo/);
    await rm(downloadInfo.filename, { force: true });
    await popup.locator('#cancel').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Cancelling…');
    await popup.locator('#clear-cache').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Local subtitle cache cleared.');
    // A strict but incomplete/unsupported draft must block the player route too,
    // instead of silently using an older active configuration with auto routing.
    const beforeStrict = { ...counts };
    await popup.locator('[data-setting="provider"]').selectOption('openrouter');
    await popup.locator('[data-setting="model"]').fill('openai/whisper-large-v3-turbo:deepinfra');
    await popup.locator('[data-setting="openrouterNoFallback"]').check();
    await popup.waitForFunction(async () => (await chrome.storage.local.get('draftSetting:openrouterNoFallback'))['draftSetting:openrouterNoFallback'] === true);
    await popup.locator('#generate').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('unavailable on OpenRouter Audio Transcriptions'));
    const blocked = await popup.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
        return chrome.runtime.sendMessage({ type: 'GENERATE', tabId: tab.id });
    });
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /unavailable on OpenRouter Audio Transcriptions/);
    assert.deepEqual(counts, beforeStrict, 'An invalid strict draft must not extract or transcribe via older automatic settings');
    await popup.locator('[data-setting="openrouterMode"]').selectOption('chat');
    await popup.waitForFunction(() => document.getElementById('strict-routing-status').textContent.includes('Whisper cannot use'));
    await popup.locator('#generate').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Whisper cannot use'));
    assert.deepEqual(counts, beforeStrict, 'Whisper chat must fail before extraction or paid upload');
    const beforeKey = await popup.locator('[data-setting="apiKey"]').inputValue();
    await popup.locator('[data-setting="openrouterNoFallback"]').uncheck();
    await popup.locator('#use-openrouter-transcriptions').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.startsWith('OpenRouter Audio Transcriptions selected.'));
    assert.equal(await popup.locator('[data-setting="openrouterMode"]').inputValue(), 'transcriptions');
    assert.equal(await popup.locator('[data-setting="openrouterNoFallback"]').isChecked(), false);
    assert.equal(await popup.locator('[data-setting="openrouterProvider"]').inputValue(), '');
    assert.equal(await popup.locator('[data-setting="model"]').inputValue(), 'openai/whisper-large-v3-turbo');
    assert.equal(await popup.locator('[data-setting="apiKey"]').inputValue(), beforeKey);
    assert.deepEqual(counts, beforeStrict, 'The repair button must only save configuration, never start a transcription');
    // Strict routing remains available for audio-input chat models.
    await popup.locator('[data-setting="openrouterMode"]').selectOption('chat');
    await popup.locator('[data-setting="model"]').fill('test/audio-chat:deepinfra');
    await popup.locator('[data-setting="openrouterNoFallback"]').check();
    await popup.waitForFunction(() => document.getElementById('strict-routing-status').textContent.includes('deepinfra only'));
    assert.match(await popup.locator('#strict-routing-status').textContent(), /test\/audio-chat\. Unavailable/);
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings.openrouterNoFallback), true);
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(path.join(workspace, 'browser-smoke.json'), JSON.stringify({ passed: true, browser: await context.browser()?.version(), extensionId, counts, externalServices: 'simulated' }, null, 2));
    console.log('Chromium MV3 smoke passed: invalid-settings repair, worker failure/timeout recovery, popup button clicks, close/reopen autosave, unfinished drafts, custom pinning, offscreen, native cues, SPA, cache, export and asbplayer (simulated services).');
} finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    // Resolve and verify the disposable browser profile before recursive removal.
    if (path.dirname(profile) === workspace) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
