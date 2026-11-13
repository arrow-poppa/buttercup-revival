// Popup recovery + local connection without valid provider settings. By default
// native messaging and HTTP are simulated. --real-native checks the installed
// per-user host and real local health, without audio or provider requests.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.join(root, 'test-results');
await mkdir(workspace, { recursive: true });
assert.equal(await realpath(workspace), path.join(await realpath(root), 'test-results'));
const profile = await mkdtemp(path.join(workspace, 'assistant-browser-'));
const real = process.argv.includes('--real-native');
const token = 'LOCAL_ASSISTANT_TEST_TOKEN_'.repeat(2);
let healthRequests = 0, providerRequests = 0, running = true, context;
let popup;
const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') return res.end('{}');
    if (req.url === '/health' && running && req.headers.authorization === `Bearer ${token}`) {
        healthRequests++;
        return res.end(JSON.stringify({ status: 'ok', version: '0.2.0', ffmpeg: true, ffprobe: true, js_runtime_available: true }));
    }
    res.writeHead(401); res.end('{}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const local = `http://127.0.0.1:${server.address().port}`;
try {
    const extension = path.join(root, 'dist', 'chromium');
    context = await chromium.launchPersistentContext(profile, { locale: 'en-US',
        headless: true,
        ...(process.env.BUTTERCUP_BROWSER ? { executablePath: process.env.BUTTERCUP_BROWSER } : { channel: 'chromium' }),
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    await context.route('https://**/*', route => { providerRequests++; return route.abort(); });
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.evaluate(async () => {
        const { DEFAULTS } = await import('./api/config.js');
        const { saveSettings, persistDraft } = await import('./api/settings.js');
        await saveSettings({ ...DEFAULTS, provider: 'deepinfra', deepinfraApiKey: 'KEEP_DEEPINFRA_KEY', apiKey: 'KEEP_ROUTER_KEY' });
        await persistDraft({ baseUrl: 'unfinished custom address', extraHeaders: '{', asbplayerUrl: 'unfinished asbplayer',
            backendUrl: 'bad local address', backendToken: '' });
    });
    if (!real) await worker.evaluate(({ local, token }) => {
        globalThis.nativeCalls = 0;
        chrome.runtime.sendNativeMessage = async (host, message) => {
            if (host !== 'app.buttercup.assistant' || JSON.stringify(message) !== '{"action":"start"}') throw new Error('Unexpected native action');
            globalThis.nativeCalls++;
            await new Promise(resolve => setTimeout(resolve, 150));
            return { ok: true, backendUrl: local, backendToken: token };
        };
    }, { local, token });
    const errors = [];
    popup.on('pageerror', error => errors.push(error.message));
    const open = async () => {
        await popup.goto(`chrome-extension://${id}/popup.html`);
        await popup.locator('#assistant-extension-id').filter({ hasText: id }).waitFor({ state: 'attached' });
    };
    await open();
    await popup.locator('#assistant-card[data-state="offline"]').waitFor();
    assert.match(await popup.locator('#assistant-message').textContent(), /Local assistant address is invalid/);
    assert.equal(await popup.locator('[data-setting="baseUrl"]').isVisible(), false);
    assert.equal(await popup.locator('[data-setting="baseUrl"]').isDisabled(), true);
    await popup.locator('[data-setting="deepinfraModel"]').fill('');
    // Connection deliberately bypasses unrelated incomplete provider fields.
    await popup.locator('#start-backend').click();
    await popup.locator('#assistant-card[data-state="online"]').waitFor({ timeout: 35000 });
    if (real) {
        const health = await popup.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'HEALTH' })).data);
        assert.ok(health.audio_modes?.includes('whole'), 'The installed assistant must advertise the new whole-audio mode');
    }
    assert.equal(await popup.locator('[data-setting="deepinfraModel"]').inputValue(), '');
    assert.equal(await popup.locator('[data-setting="deepinfraApiKey"]').inputValue(), 'KEEP_DEEPINFRA_KEY');
    assert.equal(await popup.locator('[data-setting="apiKey"]').inputValue(), 'KEEP_ROUTER_KEY');
    assert.equal(await popup.locator('[data-setting="baseUrl"]').inputValue(), 'unfinished custom address');
    assert.equal(await popup.locator('#assistant-help').getAttribute('open'), null);
    await popup.locator('[data-setting="deepinfraModel"]').fill('openai/whisper-large-v3-turbo');
    await popup.locator('.save').click();
    await popup.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved.');
    assert.equal(await popup.locator('[data-setting="extraHeaders"]').inputValue(), '{');
    assert.doesNotMatch(await popup.locator('#settings-status').textContent(), /Invalid URL|Draft restored|Draft saved/);
    if (!real) assert.equal(await worker.evaluate(() => globalThis.nativeCalls), 1);
    await popup.evaluate(() => window.scrollTo(0, 0));
    await popup.screenshot({ path: path.join(workspace, real ? 'assistant-real.png' : 'assistant.png') });
    await popup.close();
    popup = await context.newPage();
    await open();
    await popup.locator('#assistant-card[data-state="online"]').waitFor();
    if (!real) {
        // Missing bridge is explained inline without breaking fields/buttons.
        await worker.evaluate(() => { chrome.runtime.sendNativeMessage = async () => { throw new Error('Native host missing'); }; });
        await popup.locator('#start-backend').click();
        await popup.locator('#assistant-card[data-state="offline"]').waitFor();
        assert.match(await popup.locator('#assistant-message').textContent(), /Install Buttercup/);
        assert.notEqual(await popup.locator('#assistant-help').getAttribute('open'), null);
        await popup.locator('#check-backend').click();
        await popup.locator('#assistant-card[data-state="online"]').waitFor();
        running = false;
        await popup.locator('#check-backend').click();
        await popup.locator('#assistant-card[data-state="offline"]').waitFor();
        assert.match(await popup.locator('#assistant-message').textContent(), /reconnected/);
    }
    assert.equal(providerRequests, 0);
    assert.deepEqual(errors, []);
    await writeFile(path.join(workspace, real ? 'browser-assistant-real.json' : 'browser-assistant.json'), JSON.stringify({
        passed: true, browser: context.browser()?.version(), nativeHost: real ? 'installed Windows host' : 'simulated',
        healthRequests: real ? 'real local backend' : healthRequests, providerRequests,
    }, null, 2));
    console.log(`Assistant popup passed (${real ? 'real installed native host + local backend' : 'simulated host'}): one-click start/pair, independent provider drafts, persistence, no provider requests.`);
} catch (error) {
    if (popup && !popup.isClosed()) {
        console.error(await popup.locator('#status, #assistant-message, #settings-status').allTextContents());
        await popup.screenshot({ path: path.join(workspace, 'assistant-failure.png') }).catch(() => {});
    }
    throw error;
} finally {
    await context?.close();
    server.close();
    if (path.dirname(profile) === workspace) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
