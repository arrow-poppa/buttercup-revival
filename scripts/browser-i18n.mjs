// Check translated popup content and English browser metadata in clean profiles.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, setLanguage, tr } from '../api/i18n.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.join(root, 'test-results');
await mkdir(workspace, { recursive: true });
const extension = path.join(root, 'dist/chromium');
const source = await readFile(path.join(root, 'popup.html'), 'utf8');
// Product/API identifiers, native language names and example values stay literal.
const preserved = new Set(['Buttercup', 'English', 'Português', 'Español', '日本語', '简体中文',
    'pt, en, ja…', 'OpenRouter', 'DeepInfra', 'Groq', 'whisper-large-v3-turbo', 'openai/whisper-large-v3-turbo',
    'Audio Transcriptions', 'Audio Transcriptions (/audio/transcriptions)', 'Chat Completions (/chat/completions)',
    'https://your-worker.example', 'v', 'iGerman00’s Buttercup']);
const cases = [
    ['en-US', 'en', 'Connect', 'Local assistant'],
    ['pt-BR', 'pt-BR', 'Conectar', 'Assistente local'],
    ['es-ES', 'es', 'Conectar', 'Asistente local'],
    ['ja-JP', 'ja', '接続', 'ローカルアシスタント'],
    ['zh-CN', 'zh-CN', '连接', '本地助手'],
];
for (const [locale, language, badge, heading] of cases) {
    const profile = await mkdtemp(path.join(workspace, 'i18n-'));
    let context;
    try {
        context = await chromium.launchPersistentContext(profile, {
            locale, headless: true, viewport: { width: 440, height: 600 },
            ...(process.env.BUTTERCUP_BROWSER ? { executablePath: process.env.BUTTERCUP_BROWSER } : { channel: 'chromium' }),
            args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        });
        await context.route('https://**/*', route => route.abort());
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const popup = await context.newPage();
        await popup.addInitScript(() => { chrome.commands.getAll = async () => []; });
        const errors = [];
        popup.on('pageerror', error => errors.push(error.message));
        await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
        await popup.locator('#assistant-card[data-state="pair"]').waitFor();
        await popup.waitForFunction(expected => document.getElementById('assistant-badge').textContent === expected, badge);
        assert.equal(await popup.locator('html').getAttribute('lang'), language);
        assert.equal(await popup.locator('.assistant-title strong').textContent(), heading);
        setLanguage(language);
        const messages = await popup.evaluate(async source => {
            const { localize } = await import('./api/i18n.js');
            const document = new DOMParser().parseFromString(source, 'text/html');
            const messages = [];
            localize(document.body, text => { if (text.trim()) messages.push(text.trim()); return text; });
            return [...new Set(messages)];
        }, source);
        if (language !== 'en') {
            const missing = messages.filter(message => !preserved.has(message) && !/^D:\\+Subtitles$/.test(message)
                && !/^\d+\.\d+\.\d+$/.test(message) && !Object.hasOwn(LANGUAGES[language], message));
            assert.deepEqual(missing, [], `${language}: popup text is missing from its i18n catalog`);
        }
        assert.equal(await popup.locator('#regenerate').textContent(), tr('Regenerate subtitles'));
        assert.equal(await popup.locator('#keyboard-shortcuts summary').textContent(), tr('Keyboard shortcuts'));
        assert.equal(await popup.locator('#manual-connection summary').textContent(), tr('Connect without native messaging'));
        assert.equal(await popup.locator('#shortcut-generate').textContent(), tr('Not assigned'));
        assert.equal(await popup.locator('#shortcut-regenerate').textContent(), tr('Not assigned'));
        assert.equal(await popup.locator('[data-setting="theme"] option[value="dark"]').textContent(), tr('Dark'));
        assert.equal(await popup.locator('[data-setting="cueBreaks"] option[value="provider"]').textContent(), tr('Keep provider segments (original timing)'));
        const fresh = 'Starting a fresh transcription…';
        const warning = 'Word timestamps are unavailable for some text. Subtitle boundaries were estimated within the original segment to respect the word limit.';
        await popup.locator('#status').evaluate((element, text) => { element.textContent = text; }, fresh);
        await popup.waitForFunction(expected => document.getElementById('status').textContent === expected, tr(fresh));
        await popup.locator('#status').evaluate((element, text) => { element.textContent = text; }, warning);
        await popup.waitForFunction(expected => document.getElementById('status').textContent === expected, tr(warning));
        const metadata = await popup.evaluate(() => chrome.runtime.getManifest());
        assert.equal(metadata.description, 'Better YouTube captions with local audio extraction and configurable transcription APIs');
        assert.equal(metadata.default_locale, undefined);
        const first = popup.locator('[data-setting="wordsPerLine"]');
        const second = popup.locator('[data-setting="maxLineLength"]');
        await first.scrollIntoViewIfNeeded();
        const left = await first.boundingBox(), right = await second.boundingBox();
        assert.ok(Math.abs(left.y - right.y) < 1, `${language}: subtitle inputs must align`);
        assert.deepEqual(errors, []);
        if (language === 'en') {
            const appearance = popup.locator('[data-setting="theme"]');
            const pageColor = () => popup.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await appearance.selectOption('dark');
            await popup.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
            assert.equal(await pageColor(), 'rgb(28, 25, 32)');
            await popup.reload();
            await popup.locator('#assistant-card[data-state="pair"]').waitFor();
            assert.equal(await appearance.inputValue(), 'dark');
            await appearance.selectOption('light');
            assert.equal(await pageColor(), 'rgb(255, 248, 244)');
            await appearance.selectOption('auto');
            await popup.emulateMedia({ colorScheme: 'dark' });
            assert.equal(await pageColor(), 'rgb(28, 25, 32)');
            await popup.emulateMedia({ colorScheme: 'light' });
            assert.equal(await pageColor(), 'rgb(255, 248, 244)');
        }
        if (language === 'en') await popup.locator('details').filter({ has: first }).screenshot({ path: path.join(workspace, 'subtitle-layout.png') });
        console.log(`PASS ${language}: complete popup catalog, translated controls/status/shortcuts, English metadata, aligned inputs`);
    } finally {
        await context?.close();
        await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
}
