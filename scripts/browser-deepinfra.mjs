import { execFileSync } from 'node:child_process';
// Real MV3 lifecycle and UI, simulated DeepInfra/YouTube/local extraction.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const groq = process.argv.includes('--groq');
const provider = groq ? 'groq' : 'deepinfra';
const label = groq ? 'Groq' : 'DeepInfra';
const model = groq ? 'whisper-large-v3-turbo' : 'openai/whisper-large-v3-turbo';
let requestedModel = model;
const key = groq ? 'GROQ_TEST_KEY' : 'DEEPINFRA_TEST_KEY';
const host = groq ? 'api.groq.com' : 'api.deepinfra.com';
const workspace = path.join(root, 'test-results');
await mkdir(workspace, { recursive: true });
assert.equal(await realpath(workspace), path.join(await realpath(root), 'test-results'));
const profile = await mkdtemp(path.join(workspace, `${provider}-browser-`));
const counts = { extracts: 0, transcriptions: 0, router: 0, catalog: 0 };
let fail = false, mixedTiming = false, context;
const server = createServer(async (req, res) => {
    const bytes = []; for await (const chunk of req) bytes.push(chunk);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') return res.end('{}');
    assert.equal(req.headers.authorization, 'Bearer LOCAL_TEST_TOKEN');
    if (req.url === '/health') return res.end(JSON.stringify({ status: 'ok', version: '0.2.0', audio_modes: ['chunks', 'whole'] }));
    if (req.url === '/jobs/extract') {
        counts.extracts++;
        const whole = JSON.parse(Buffer.concat(bytes)).audio_mode === 'whole';
        return res.end(JSON.stringify({ id: 'job', state: 'ready', audio_mode: whole ? 'whole' : 'chunks', chunks: whole
            ? [{ index: 0, offset: 0, duration: 509.321 }] : [{ index: 0, offset: 0, duration: 3 },
            ...(mixedTiming ? [{ index: 1, offset: 1.5, duration: 3 }] : [])] }));
    }
    if (req.url === '/jobs/job/chunks/0') { res.setHeader('Content-Type', 'audio/mpeg'); return res.end('test audio'); }
    if (req.url === '/jobs/job/chunks/1') { res.setHeader('Content-Type', 'audio/mpeg'); return res.end('fallback audio'); }
    if (req.url === '/jobs/job' && req.method === 'DELETE') return res.end('{}');
    res.statusCode = 404; res.end('{}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const local = `http://127.0.0.1:${server.address().port}`;
try {
    context = await chromium.launchPersistentContext(profile, { locale: 'en-US',
        headless: !process.env.BUTTERCUP_TEST_SHORTCUTS,
        ...(process.env.BUTTERCUP_BROWSER ? { executablePath: process.env.BUTTERCUP_BROWSER } : { channel: 'chromium' }),
        args: [...(process.env.BUTTERCUP_TEST_SHORTCUTS ? ['--ozone-platform=x11'] : []), `--disable-extensions-except=${path.join(root, 'dist', 'chromium')}`, `--load-extension=${path.join(root, 'dist', 'chromium')}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    await context.route(/https:\/\/(?:openrouter\.ai|api\.(?:deepinfra|groq)\.com)\//, route => {
        counts.router++;
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Unexpected OpenRouter request"}' });
    });
    await context.route(`https://${host}/**`, route => {
        const request = route.request(), headers = request.headers();
        if (new URL(request.url()).pathname === (groq ? '/openai/v1/models' : '/models/list')) {
            counts.catalog++;
            assert.equal(headers.authorization, groq ? `Bearer ${key}` : undefined);
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(groq ? { data: [{ id: model, active: true }, { id: 'text-only/model' }] } : [
                { type: 'automatic-speech-recognition', model_name: 'openai/whisper-large-v3-turbo' },
                { type: 'text-generation', model_name: 'text-only/model' },
            ]) });
        }
        counts.transcriptions++;
        assert.equal(decodeURIComponent(request.url()), groq ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.deepinfra.com/v1/inference/' + requestedModel);
        assert.equal(headers.authorization, `Bearer ${key}`);
        assert.equal(headers['x-openrouter-title'], undefined);
        const body = request.postData();
        if (groq) {
            assert.match(body, /name="file"/); assert.match(body, /name="timestamp_granularities\[\]"\r\n\r\nword/);
            assert.match(body, /name="response_format"\r\n\r\nverbose_json/);
        } else {
            assert.match(body, /name="audio"/); assert.match(body, /name="chunk_level"\r\n\r\nword/);
            assert.doesNotMatch(body, /name="file"/);
        }
        assert.doesNotMatch(body, /OPENROUTER_TEST_KEY|LOCAL_TEST_TOKEN|name="provider"/);
        const fallback = body.includes('fallback audio');
        return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail
            ? { error: `${label} unavailable` }
            : fallback ? { language: 'pt', words: [{ start: 1, end: 1, text: 'invalid timing' }], segments: [{ start: 1, end: 2, text: 'fallback speech' }] }
            : { language: 'pt', words: [{ start: .1, end: .5, text: 'Olá' }, { start: .5, end: 1, text: 'mundo' }, { start: 1, end: 1.5, text: 'hoje' }],
                segments: [{ start: .1, end: 1.5, text: 'Olá mundo hoje' }] }) });
    });
    await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: `
        <title>Buttercup shortcut fixture</title><div id="movie_player"><video></video><div class="ytp-right-controls"></div></div><script>
        document.getElementById('movie_player').getPlayerResponse = () => ({videoDetails:{videoId:'abcdefghijk'}});
        </script>` }));
    const youtube = await context.newPage();
    await youtube.goto('https://www.youtube.com/watch?v=abcdefghijk');
    await youtube.waitForSelector('#buttercup-button');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator('#extension-id').filter({ hasText: id }).waitFor({ state: 'attached' });
    await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    await popup.locator('[data-setting="apiKey"]').fill('OPENROUTER_TEST_KEY');
    await popup.locator('[data-setting="backendUrl"]').fill(local);
    await popup.locator('[data-setting="backendToken"]').fill('LOCAL_TEST_TOKEN');
    await popup.locator('[data-setting="preferHuman"]').uncheck();
    await popup.locator('[data-setting="wordsPerLine"]').fill('2');
    assert.deepEqual(await popup.locator('[data-setting="provider"] option').evaluateAll(items => items.map(item => item.value)), ['openrouter', 'deepinfra', 'groq', 'custom']);
    for (const choice of ['openrouter', 'deepinfra', 'groq', 'custom']) {
        await popup.locator('[data-setting="provider"]').selectOption(choice);
        for (const panel of ['openrouter', 'deepinfra', 'groq', 'custom']) {
            assert.equal(await popup.locator(`#${panel}-settings`).isVisible(), choice === panel, `${choice} must display only its own panel`);
        }
    }
    await popup.locator('[data-setting="provider"]').selectOption(provider);
    assert.equal(await popup.locator(`#${provider}-settings`).isVisible(), true);
    assert.equal(await popup.locator('#shared-key').isVisible(), false);
    assert.equal(await popup.locator(`[data-setting="${provider}ApiKey"]`).inputValue(), '');
    await popup.locator(`[data-setting="${provider}ApiKey"]`).fill(key);
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    await popup.locator('#models').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.includes('model suggestions found')).catch(async error => {
        throw new Error(`Model discovery did not finish: ${await popup.locator('#status').textContent()}; requests=${JSON.stringify(counts)}`, { cause: error });
    });
    assert.equal(await popup.locator(`#${provider}-model-list option`).count(), 1);
    // Chromium offscreen targets are not exposed as routable Playwright Pages.
    // Run the same runner in an extension Page for HTTPS API interception;
    // browser-smoke/browser-connection cover the actual offscreen lifecycle.
    const processing = await context.newPage();
    await processing.goto(`chrome-extension://${id}/background/offscreen.html`);
    await worker.evaluate(() => { chrome.offscreen.hasDocument = async () => true; });
    await popup.locator('#sample').setInputFiles({ name: 'sample.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('test audio') });
    await popup.locator('#provider-test').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent.startsWith('Compatible:'), null, { timeout: 10000 }).catch(async error => {
        throw new Error(`Provider test did not finish: ${await popup.locator('#status').textContent()}; requests=${JSON.stringify(counts)}`, { cause: error });
    });
    assert.match(await popup.locator('#status').textContent(), /3 timed words/);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/*' }))[0].id);
    async function generate(expected) {
        await popup.evaluate(tabId => chrome.storage.session.remove(`status-${tabId}`), tabId);
        const started = await popup.evaluate(tabId => chrome.runtime.sendMessage({ type: 'GENERATE', tabId }), tabId);
        assert.equal(started.ok, true, JSON.stringify(started));
        let status;
        for (let i = 0; i < 100; i++) {
            status = await popup.evaluate(async tabId => (await chrome.storage.session.get(`status-${tabId}`))[`status-${tabId}`], tabId);
            if (['ready', 'error'].includes(status?.stage)) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.equal(status?.stage, expected, JSON.stringify(status));
        return status;
    }
    await generate('ready');
    assert.equal(await youtube.evaluate(() => document.querySelector('video').textTracks[0].cues.length), 2);
    const beforeFormatting = { ...counts };
    await popup.locator('[data-setting="wordsPerLine"]').fill('1');
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    assert.equal((await generate('ready')).source, 'cache');
    assert.equal(await youtube.evaluate(() => document.querySelector('video').textTracks[0].cues.length), 3);
    assert.deepEqual(counts, beforeFormatting);
    await popup.locator('[data-setting="provider"]').selectOption('openrouter');
    assert.equal(await popup.locator('[data-setting="apiKey"]').inputValue(), 'OPENROUTER_TEST_KEY');
    await popup.locator('[data-setting="provider"]').selectOption(provider);
    assert.equal(await popup.locator(`[data-setting="${provider}ApiKey"]`).inputValue(), key);
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'CACHE_CLEAR' }));
    fail = true;
    const failed = await generate('error');
    assert.match(failed.message, new RegExp(`${label} HTTP 503`));
    assert.equal(counts.transcriptions, beforeFormatting.transcriptions + 1);
    assert.equal(counts.router, 0, 'A DeepInfra error must never fall back to OpenRouter');
    assert.equal(counts.catalog, 1);
    fail = false; mixedTiming = true;
    const mixed = await generate('ready');
    assert.match(mixed.message, /Invalid word timestamps/);
    assert.match(mixed.message, /boundaries were estimated/);
    assert.deepEqual(await youtube.evaluate(() => Array.from(document.querySelector('video').textTracks[0].cues).map(cue => cue.text)), ['Olá', 'mundo', 'hoje', 'fallback', 'speech']);
    const beforeProviderLayout={...counts};
    await popup.locator('[data-setting="cueBreaks"]').selectOption('provider');
    assert.equal(await popup.locator('[data-setting="wordsPerLine"]').isDisabled(),true);
    await popup.locator('.save').click();
    await popup.waitForFunction(()=>document.getElementById('status').textContent==='Settings saved.');
    const providerLayout=await generate('ready');
    assert.equal(providerLayout.source,'cache');assert.doesNotMatch(providerLayout.message,/boundaries were estimated/);
    assert.deepEqual(await youtube.evaluate(()=>Array.from(document.querySelector('video').textTracks[0].cues).map(cue=>cue.text)),['Olá mundo hoje','fallback speech']);
    assert.deepEqual(counts,beforeProviderLayout);
    await popup.locator('[data-setting="cueBreaks"]').selectOption('words');
    assert.equal(await popup.locator('[data-setting="wordsPerLine"]').isEnabled(),true);
    await popup.locator('.save').click();
    await popup.waitForFunction(()=>document.getElementById('status').textContent==='Settings saved.');
    if (process.env.BUTTERCUP_TEST_SHORTCUTS) {
        const commands=await worker.evaluate(()=>chrome.commands.getAll());
        assert.equal(commands.find(c=>c.name==='generate-subtitles').shortcut,'Alt+Shift+G');
        assert.equal(commands.find(c=>c.name==='regenerate-subtitles').shortcut,'Alt+Shift+U');
        const keys=async key=>{
            await youtube.bringToFront();
            const windows=execFileSync('xdotool',['search','--onlyvisible','--name','Buttercup shortcut fixture'],{encoding:'utf8'}).trim().split('\n');
            execFileSync('xdotool',['windowfocus','--sync',windows[0]]);
            execFileSync('xdotool',['key','--clearmodifiers',key]);
        };
        const snapshot={...counts};
        await popup.evaluate(tabId=>chrome.storage.session.remove(`status-${tabId}`),tabId);
        await keys('alt+shift+g');
        await popup.waitForFunction(async tabId=>(await chrome.storage.session.get(`status-${tabId}`))[`status-${tabId}`]?.source==='cache',tabId);
        assert.deepEqual(counts,snapshot,'Generate shortcut must reuse the cache');
        await popup.evaluate(tabId=>chrome.storage.session.remove(`status-${tabId}`),tabId);
        await keys('alt+shift+u');
        for(let attempt=0;attempt<100;attempt++) {
            const state=await popup.evaluate(async tabId=>(await chrome.storage.session.get(`status-${tabId}`))[`status-${tabId}`],tabId);
            if(counts.transcriptions===snapshot.transcriptions+2&&state?.stage==='ready')break;
            await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.equal(counts.extracts,snapshot.extracts+1);
        assert.equal(counts.transcriptions,snapshot.transcriptions+2,'Regenerate shortcut must bypass cache');
        await popup.bringToFront();
        console.log('Physical Generate and Regenerate shortcuts passed');
    }
    // This test opens popup.html in a tab. Model the active YouTube tab that
    // a real browser-action popup sees before exercising the actual button.
    await popup.evaluate(tabId => {
        const query=chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query=options=>options.active ? Promise.resolve([{id:tabId}]) : query(options);
        document.getElementById('reload-settings').click();
    },tabId);
    await popup.locator('#settings-fields:not([disabled])').waitFor();
    const beforeRegenerate = {...counts};
    await popup.evaluate(tabId => chrome.storage.session.remove(`status-${tabId}`),tabId);
    await popup.locator('#regenerate').click();
    // The button first commits settings asynchronously. Do not mistake a late
    // ready notification from the previous run for completion of this one.
    for (let attempt=0;attempt<100;attempt++) {
        const state=await popup.evaluate(async tabId=>(await chrome.storage.session.get(`status-${tabId}`))[`status-${tabId}`],tabId);
        if (counts.extracts===beforeRegenerate.extracts+1 && counts.transcriptions===beforeRegenerate.transcriptions+2 && state?.stage==='ready') break;
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(counts.extracts,beforeRegenerate.extracts+1);
    assert.equal(counts.transcriptions,beforeRegenerate.transcriptions+2,'Explicit regenerate must refresh each audio part once');
    const afterMixed = { ...counts };
    assert.equal((await generate('ready')).source, 'cache');
    assert.deepEqual(counts, afterMixed, 'Mixed timestamp recovery must survive cached playback without another provider request');
    assert.equal(await youtube.evaluate(() => document.querySelector('video').textTracks[0].cues.length), 5);
    await popup.locator('[data-setting="audioMode"]').selectOption('whole');
    assert.equal(await popup.locator('#chunk-options').isVisible(), false);
    assert.equal(await popup.locator('#whole-audio-hint').isVisible(), true);
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    const additionalModels = groq ? ['whisper-large-v3'] : ['Qwen/Qwen3-ASR-1.7B', 'mistralai/Voxtral-Mini-3B-2507', 'nvidia/NVIDIA-Nemotron-3.5-Transcribe-30B-A4B'];
    for (requestedModel of additionalModels) {
        await popup.locator(`[data-setting="${provider}Model"]`).fill(requestedModel);
        await popup.locator('.save').click();
        await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
        const beforeWhole = { ...counts };
        await generate('ready');
        assert.equal(counts.transcriptions, beforeWhole.transcriptions + 1, 'Whole-audio mode must make one request, including Qwen/Voxtral');
        assert.equal(await youtube.evaluate(() => document.querySelector('video').textTracks[0].cues.length), 3);
    }
    const openedShortcuts=context.waitForEvent('page');
    await popup.locator('#configure-shortcuts').click();
    const shortcutPage=await openedShortcuts;
    await shortcutPage.waitForURL('chrome://extensions/shortcuts');
    await shortcutPage.close();
    await writeFile(path.join(workspace, `browser-${provider}.json`), JSON.stringify({ passed: true, browser: await context.browser()?.version(), counts, externalServices: 'simulated' }, null, 2));
    console.log(`${label} passed: native ASR models, one-request whole audio, panels/keys, mixed timestamps, cache reformatting and failure without fallback.`);
} finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    if (path.dirname(profile) === workspace) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
