// Exercise the popup-to-tab handoff and file input in a disposable Chromium
// extension profile. All keys and backup contents below are synthetic fixtures.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../api/config.js';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.join(root, 'test-results');
await mkdir(workspace, { recursive: true });
const profile = await mkdtemp(path.join(workspace, 'import-'));
const extension = path.join(root, 'dist/extension');
let context;
try {
    context = await chromium.launchPersistentContext(profile, {
        locale: 'en-US', headless: true,
        ...(process.env.BUTTERCUP_BROWSER ? { executablePath: process.env.BUTTERCUP_BROWSER } : { channel: 'chromium' }),
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await context.route('https://**/*', route => route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const base = `chrome-extension://${new URL(worker.url()).host}`;
    await worker.evaluate(settings => chrome.storage.local.set({ settings }), {
        ...DEFAULTS, uiLanguage: 'en', apiKey: 'EXISTING_TEST_KEY',
        backendUrl: 'http://127.0.0.1:1', backendToken: 'CURRENT_TEST_PAIRING',
    });
    const popup = await context.newPage();
    await popup.goto(`${base}/popup.html`);
    await popup.locator('#settings-fields:not([disabled])').waitFor();
    await popup.locator('#backup-settings').evaluate(element => { element.open = true; });
    assert.equal(await popup.locator('#settings-file-picker').isVisible(), false);
    // Save an unfinished edit immediately before opening the import tab.
    await popup.locator('[data-setting="prompt"]').fill('Unsaved fixture prompt');
    const opened = context.waitForEvent('page');
    await popup.locator('#import-settings').click();
    const tab = await opened;
    await tab.waitForURL(`${base}/popup.html?view=settings#backup-settings`);
    await tab.locator('#settings-fields:not([disabled])').waitFor();
    await popup.close(); // The initiating popup can disappear completely.
    assert.equal(await tab.locator('#settings-file-picker').isVisible(), true);
    assert.equal(await tab.locator('[data-setting="prompt"]').inputValue(), 'Unsaved fixture prompt');
    assert.equal(await tab.locator('#backup-settings').getAttribute('open'), '');
    const errors = [];
    tab.on('pageerror', error => errors.push(error.message));
    const stored = () => worker.evaluate(() => chrome.storage.local.get(null));
    const initial = await stored();
    const choose = async payload => {
        const chooser = tab.waitForEvent('filechooser');
        await tab.locator('#settings-file').click();
        await (await chooser).setFiles(payload);
    };
    await choose([]);
    await tab.locator('#import-settings').click();
    await tab.waitForFunction(() => document.getElementById('status').textContent === 'Choose a Buttercup settings file.');
    assert.deepEqual(await stored(), initial);
    for (const payload of [
        Buffer.from('{broken'),
        Buffer.from(JSON.stringify({ app: 'other', settings: { language: 'ja' } })),
        Buffer.alloc(1048577, ' '),
    ]) {
        await choose({ name: 'invalid.json', mimeType: 'application/json', buffer: payload });
        await tab.locator('#import-settings').click();
        await tab.waitForFunction(() => /^(This is not a Buttercup settings file\.|Choose a Buttercup settings file\.)$/.test(document.getElementById('status').textContent));
        assert.deepEqual(await stored(), initial, 'Invalid backups must not alter stored settings');
    }
    const backup = { app: 'buttercup-revival', version: '0.5.0', settings: {
        provider: 'deepinfra', deepinfraApiKey: 'IMPORTED_TEST_KEY', deepinfraModel: 'Qwen/Qwen3-ASR-0.6B',
        wordsPerLine: '7', showOnPlayer: false, backendToken: 'OLD_TEST_PAIRING', backendUrl: 'http://127.0.0.1:9',
    } };
    await choose({ name: 'buttercup-settings-0.5.0.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    // A regular tab keeps the selected file even after another tab takes focus.
    const other = await context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await tab.bringToFront();
    assert.equal(await tab.locator('#settings-file').evaluate(input => input.files[0].name), 'buttercup-settings-0.5.0.json');
    await tab.locator('#import-settings').click();
    await tab.waitForFunction(() => document.getElementById('status').textContent === 'Settings imported.');
    assert.equal(await tab.locator('#settings-import-status').textContent(), 'Settings imported.');
    const imported = (await stored()).settings;
    assert.equal(imported.provider, 'deepinfra');
    assert.equal(imported.deepinfraApiKey, 'IMPORTED_TEST_KEY');
    assert.equal(imported.deepinfraModel, 'Qwen/Qwen3-ASR-0.6B');
    assert.equal(imported.wordsPerLine, 7);
    assert.equal(imported.showOnPlayer, false);
    assert.equal(imported.backendToken, 'CURRENT_TEST_PAIRING');
    assert.equal(imported.backendUrl, 'http://127.0.0.1:1');
    assert.equal(imported.apiKey, 'EXISTING_TEST_KEY');
    assert.equal(imported.prompt, 'Unsaved fixture prompt');
    assert.equal(await tab.locator('#settings-file').inputValue(), '');
    await choose({ name: 'language.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        app: 'buttercup-revival', version: '0.5.0', settings: { uiLanguage: 'pt-BR' },
    })) });
    await tab.locator('#import-settings').click();
    await tab.waitForFunction(() => document.documentElement.lang === 'pt-BR'
        && document.getElementById('status').textContent === 'Configurações importadas.', null, { timeout: 10000 });
    assert.equal(await tab.locator('#settings-file-picker').isVisible(), true);
    await tab.close();
    const reopened = await context.newPage();
    await reopened.goto(`${base}/popup.html`);
    await reopened.locator('#settings-fields:not([disabled])').waitFor();
    assert.equal(await reopened.locator('[data-setting="provider"]').inputValue(), 'deepinfra');
    assert.equal(await reopened.locator('[data-setting="deepinfraModel"]').inputValue(), 'Qwen/Qwen3-ASR-0.6B');
    assert.equal(await reopened.locator('[data-setting="wordsPerLine"]').inputValue(), '7');
    assert.deepEqual(errors, []);
    console.log('Import passed: popup closure, persistent file selection, cancellation, invalid/oversized files, v0.5.0 restore, language changes, retained pairing and popup recreation.');
} finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
