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
const extension = path.join(root, 'dist/chromium');
let context;
try {
    context = await chromium.launchPersistentContext(profile, {
        locale: 'en-US', headless: true,
        ...(process.env.BUTTERCUP_BROWSER ? { executablePath: process.env.BUTTERCUP_BROWSER } : { channel: 'chromium' }),
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await context.route('https://**/*', route => route.abort());
    // File handling is real; only the eventual service requests are simulated.
    await context.addInitScript(() => {
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        window.fileRequests = [];
        let importedCookies = false, persistentCookies = false;
        chrome.runtime.sendMessage = async (message, ...args) => {
            if (['PROVIDER_TEST', 'COOKIE_IMPORT', 'IMPORT_BACKEND'].includes(message.type)) {
                window.fileRequests.push(message);
                if (message.type === 'PROVIDER_TEST') return { ok: true, data: { segments: 1, words: 2, warnings: [] } };
                if (message.type === 'COOKIE_IMPORT') {
                    importedCookies = true; persistentCookies = message.persist;
                    return { ok: true, data: {} };
                }
                return { ok: true, data: { state: 'online', message: 'Local assistant connected.' } };
            }
            if (message.type === 'COOKIE_STATUS') return { ok: true, data: {
                imported: importedCookies, enabled: importedCookies, persistent: persistentCookies, imported_at: 'fixture',
            } };
            return send(message, ...args);
        };
    });
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
    await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
    assert.equal(await popup.locator('input[type="file"]:visible').count(), 0, 'Every file picker must be hidden in the popup');
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
    // Every other file action must hand off before opening a native file picker.
    const fileCases = [
        { view: 'sample', button: 'provider-test', input: 'sample', section: 'sample-test', status: 'sample-test-status', limit: 2000000,
            payload: { name: 'spoken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('synthetic spoken audio') },
            empty: 'Choose a spoken audio sample up to 2 MB.', result: /^Compatible:/, type: 'PROVIDER_TEST' },
        { view: 'cookies', button: 'import-cookies', input: 'cookies', section: 'cookie-settings', status: 'cookies-import-status', limit: 1048576,
            payload: { name: 'cookies.txt', mimeType: 'text/plain', buffer: Buffer.from('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tTEST\tSYNTHETIC_VALUE\n') },
            empty: 'Choose a Netscape cookies.txt file up to 1 MiB.', result: /^Cookies imported/, type: 'COOKIE_IMPORT' },
        { view: 'connection', button: 'open-connection-editor', submit: 'import-connection', input: 'connection-file', section: 'manual-connection', status: 'connection-import-status', limit: 16384,
            payload: { name: 'connection.private.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'buttercup-connection', origin: base, backendUrl: 'http://127.0.0.1:1', backendToken: 'SYNTHETIC_CONNECTION_TOKEN' })) },
            empty: 'Choose the private connection file created by the assistant setup.', result: /^Assistant connected\./, type: 'IMPORT_BACKEND' },
    ];
    for (const example of fileCases) {
        const launch = await context.newPage();
        await launch.goto(`${base}/popup.html`);
        await launch.locator('#settings-fields:not([disabled])').waitFor();
        await launch.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
        assert.equal(await launch.locator('input[type="file"]:visible').count(), 0);
        await launch.locator('[data-setting="prompt"]').fill(`Draft before ${example.view}`);
        if (example.view === 'sample') await launch.locator('[data-setting="deepinfraModel"]').fill('');
        let popupChoosers = 0;
        launch.on('filechooser', () => popupChoosers++);
        const opening = context.waitForEvent('page');
        await launch.locator(`#${example.button}`).click();
        const editor = await opening;
        await editor.waitForURL(`${base}/popup.html?view=${example.view}#${example.section}`);
        await editor.locator('#settings-fields:not([disabled])').waitFor();
        assert.equal(popupChoosers, 0, 'The popup must never open a native picker');
        await launch.close();
        assert.equal(await editor.locator('[data-setting="prompt"]').inputValue(), `Draft before ${example.view}`);
        if (example.view === 'sample') {
            assert.equal(await editor.locator('[data-setting="deepinfraModel"]').inputValue(), '', 'An unfinished model must survive the handoff');
            await editor.locator('[data-setting="deepinfraModel"]').fill('Qwen/Qwen3-ASR-0.6B');
        }
        assert.equal(await editor.locator(`#${example.input}`).isVisible(), true);
        const submit = editor.locator(`#${example.submit || example.button}`);
        const chooseFile = async payload => {
            const chooser = editor.waitForEvent('filechooser');
            await editor.locator(`#${example.input}`).click();
            await (await chooser).setFiles(payload);
        };
        await chooseFile([]);
        await submit.click();
        await editor.waitForFunction(({ id, text }) => document.getElementById(id).textContent === text, { id: example.status, text: example.empty });
        await chooseFile({ name: example.payload.name, mimeType: example.payload.mimeType, buffer: Buffer.alloc(example.limit + 1, ' ') });
        await submit.click();
        await editor.waitForFunction(({ id, text }) => document.getElementById(id).textContent === text, { id: example.status, text: example.empty });
        assert.equal(await editor.evaluate(() => window.fileRequests.length), 0, 'Invalid selections must not contact services');
        await chooseFile(example.payload);
        await other.bringToFront();
        await editor.bringToFront();
        assert.equal(await editor.locator(`#${example.input}`).evaluate(input => input.files[0].name), example.payload.name);
        assert.equal(await editor.evaluate(() => window.fileRequests.length), 0, 'Selecting a file must not submit it');
        if (example.view === 'cookies') {
            assert.equal(await editor.locator('#persist-cookies').isChecked(), false);
            await editor.locator('#persist-cookies').check();
        }
        await submit.click();
        await editor.waitForFunction(({ id, source }) => new RegExp(source).test(document.getElementById(id).textContent), { id: example.status, source: example.result.source });
        const calls = await editor.evaluate(() => window.fileRequests);
        assert.equal(calls.length, 1); assert.equal(calls[0].type, example.type);
        if (example.view === 'sample') {
            assert.equal(Buffer.from(calls[0].audio, 'base64').toString(), example.payload.buffer.toString());
            assert.equal(calls[0].mime, 'audio/mpeg');
        }
        if (example.view === 'cookies') {
            assert.equal(calls[0].content, example.payload.buffer.toString()); assert.equal(calls[0].persist, true);
            assert.equal(await editor.locator('#cookies').inputValue(), '');
        }
        await editor.close();
    }
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
    console.log('Import passed: all four popup-to-tab routes, native file choosers, popup closure/focus changes, cancellation/oversize guards, explicit submissions, cookie consent, settings restore and retained pairing.');
} finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
