// Verify durable route/provider preferences across complete browser restarts.
// Uses a disposable profile and never calls a transcription service.
import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.join(root, 'test-results');
await mkdir(workspace, { recursive: true });
if (await realpath(workspace) !== path.join(await realpath(root), 'test-results')) throw new Error('Test artifacts must stay inside the project');
const profile = await mkdtemp(path.join(workspace, 'settings-browser-'));
const extension = path.join(root, 'dist', 'chromium');
const executablePath = process.env.BUTTERCUP_BROWSER || undefined;
let context, browserVersion;
try {
    for (let round = 0; round < 5; round++) {
        console.log(`Settings browser round ${round + 1}/5`);
        context = await chromium.launchPersistentContext(profile, { locale: 'en-US',
            headless: true, ...(executablePath ? { executablePath } : { channel: 'chromium' }),
            args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        });
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 30000 });
        const extensionId = new URL(worker.url()).host;
        let popup = await context.newPage();
        if (round === 0) await popup.addInitScript(() => {
            const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
            chrome.runtime.sendMessage = (message, ...args) => ['POPUP_SETTINGS', 'SAVE_DRAFT', 'APPLY_DRAFT', 'COMMIT_DRAFT'].includes(message.type)
                ? Promise.resolve({ ok: false, error: 'Unknown Buttercup action' }) : sendMessage(message, ...args);
        });
        await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        await popup.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
        await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
        if (round === 0) {
            await popup.locator('[data-setting="audioTrack"]').selectOption('original');
            await popup.locator('[data-setting="model"]').fill('openai/whisper-large-v3-turbo');
            await popup.locator('[data-setting="openrouterMode"]').selectOption('chat');
            await popup.locator('[data-setting="openrouterProvider"]').fill('groq');
            await popup.locator('[data-setting="openrouterNoFallback"]').check();
            await popup.locator('.save').click();
            await popup.waitForFunction(() => ['Settings saved.', 'Unknown Buttercup action'].includes(document.getElementById('status').textContent));
            assert.equal(await popup.locator('#status').textContent(), 'Settings saved.', 'The popup must save using commands supported by older workers');
        } else {
            assert.equal(await popup.locator('[data-setting="openrouterNoFallback"]').isChecked(), true);
            assert.equal(await popup.locator('[data-setting="audioTrack"]').inputValue(), 'original');
            assert.equal(await popup.locator('[data-setting="openrouterMode"]').inputValue(), 'chat');
            assert.equal(await popup.locator('[data-setting="openrouterProvider"]').inputValue(), 'groq');
            assert.equal(await popup.locator('[data-setting="model"]').inputValue(), 'openai/whisper-large-v3-turbo');
            if (round === 1) {
                const incompatible = await context.newPage();
                await incompatible.addInitScript(() => {
                    const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
                    window.generateRequests = 0;
                    chrome.runtime.sendMessage = (message, ...args) => {
                        if (message.type === 'GENERATE') window.generateRequests++;
                        if (message.type === 'SAVE') return Promise.resolve({ ok: true, data: {
                            ...message.settings, openrouterMode: 'transcriptions', openrouterProvider: '',
                        } });
                        return sendMessage(message, ...args);
                    };
                });
                await incompatible.goto(`chrome-extension://${extensionId}/popup.html`);
                await incompatible.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
                await incompatible.locator('#generate').click();
                await incompatible.locator('#update-extension').waitFor();
                assert.match(await incompatible.locator('#status').textContent(), /Reload extension/);
                assert.equal(await incompatible.evaluate(() => window.generateRequests), 0, 'A discarded pin must block generation');
                const restarted = context.waitForEvent('serviceworker', { timeout: 30000 });
                await incompatible.locator('#update-extension').click();
                await restarted;
                popup = await context.newPage();
                await popup.goto(`chrome-extension://${extensionId}/popup.html`);
                await popup.locator('#extension-id').filter({ hasText: extensionId }).waitFor({ state: 'attached' });
                await popup.locator('details').evaluateAll(items => items.forEach(item => { item.open = true; }));
                assert.equal(await popup.locator('[data-setting="openrouterMode"]').inputValue(), 'chat');
                assert.equal(await popup.locator('[data-setting="openrouterProvider"]').inputValue(), 'groq');
                assert.equal(await popup.locator('#update-extension').isVisible(), false);
                await popup.locator('[data-setting="provider"]').selectOption('custom');
                await popup.locator('[data-setting="baseUrl"]').fill('http://127.0.0.1:9876/v1');
                await popup.locator('[data-setting="customMode"]').selectOption('chat');
                await popup.locator('[data-setting="customProvider"]').fill('custom-provider');
                // Close immediately after editing, without Save or waiting for a reply.
            } else if (round === 2) {
                assert.equal(await popup.locator('[data-setting="provider"]').inputValue(), 'custom');
                assert.equal(await popup.locator('[data-setting="customMode"]').inputValue(), 'chat');
                assert.equal(await popup.locator('[data-setting="customProvider"]').inputValue(), 'custom-provider');
                assert.equal(await popup.locator('[data-setting="baseUrl"]').inputValue(), 'http://127.0.0.1:9876/v1');
                await popup.locator('[data-setting="provider"]').selectOption('deepinfra');
                await popup.locator('[data-setting="deepinfraApiKey"]').fill('DEEPINFRA_PERSISTENCE_KEY');
                await popup.locator('[data-setting="deepinfraModel"]').fill('openai/whisper-large-v3');
                await popup.locator('[data-setting="provider"]').selectOption('groq');
                await popup.locator('[data-setting="groqApiKey"]').fill('GROQ_PERSISTENCE_KEY');
                await popup.locator('[data-setting="groqModel"]').fill('whisper-large-v3');
            } else if (round === 3) {
                assert.equal(await popup.locator('[data-setting="provider"]').inputValue(), 'groq');
                assert.equal(await popup.locator('[data-setting="groqApiKey"]').inputValue(), 'GROQ_PERSISTENCE_KEY');
                assert.equal(await popup.locator('[data-setting="groqModel"]').inputValue(), 'whisper-large-v3');
                assert.equal(await popup.locator('#groq-settings').isVisible(), true);
                assert.equal(await popup.locator('#deepinfra-settings').isVisible(), false);
                await popup.locator('[data-setting="provider"]').selectOption('deepinfra');
                await popup.locator('[data-setting="parallelRequests"]').selectOption('2');
                await popup.locator('[data-setting="audioMode"]').selectOption('whole');
            } else {
                assert.equal(await popup.locator('[data-setting="provider"]').inputValue(), 'deepinfra');
                assert.equal(await popup.locator('[data-setting="deepinfraApiKey"]').inputValue(), 'DEEPINFRA_PERSISTENCE_KEY');
                assert.equal(await popup.locator('[data-setting="deepinfraModel"]').inputValue(), 'openai/whisper-large-v3');
                assert.equal(await popup.locator('[data-setting="groqApiKey"]').inputValue(), 'GROQ_PERSISTENCE_KEY');
                assert.equal(await popup.locator('[data-setting="groqModel"]').inputValue(), 'whisper-large-v3');
                assert.equal(await popup.locator('[data-setting="audioMode"]').inputValue(), 'whole');
                assert.equal(await popup.locator('[data-setting="parallelRequests"]').inputValue(), '2');
                assert.equal(await popup.locator('#chunk-options').isVisible(), false);
            }
        }
        browserVersion = await context.browser()?.version();
        await popup.close();
        await context.close();
        context = undefined;
    }
    await writeFile(path.join(workspace, 'browser-settings.json'), JSON.stringify({
        passed: true, browser: browserVersion, fullBrowserRestarts: 4,
        openrouter: { mode: 'chat', pinnedProvider: 'groq' },
        custom: { mode: 'chat', pinnedProvider: 'custom-provider' },
        transcriptionRequests: 0,
    }, null, 2));
    console.log('Settings persistence passed: routes, pins, DeepInfra/Groq keys and models survive four complete browser restarts, including edits saved without a worker reply.');
} finally {
    await context?.close();
    if (path.dirname(profile) === workspace) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
