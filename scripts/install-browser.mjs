// Configure only Buttercup's dedicated browser profile. Never reads browser cookies.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const state = path.join(process.env.LOCALAPPDATA, 'ButtercupRevival');
const configPath = path.join(state, 'installation.windows.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const { token } = JSON.parse(await readFile(path.join(state, 'token.private.json'), 'utf8'));
const extension = path.join(root, 'dist', 'chromium');
let context;
try {
    const args = config.browser_kind === 'edge'
        ? [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
        : ['--enable-unsafe-extension-debugging'];
    context = await chromium.launchPersistentContext(config.browser_profile, {
        executablePath: config.browser, headless: true, args,
        ignoreDefaultArgs: ['--disable-extensions'],
    });
    if (config.browser_kind === 'chrome') {
        // This flag is used only during installation, never by the normal launcher.
        const protocol = await context.browser().newBrowserCDPSession();
        await protocol.send('Extensions.loadUnpacked', { path: extension });
    }
    const worker = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension://'))
        || await context.waitForEvent('serviceworker', { timeout: 30000 });
    const extensionId = new URL(worker.url()).host;
    if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('Invalid installed extension ID');
    config.extension_id = extensionId;
    await writeFile(configPath, JSON.stringify(config, null, 2));
    const run = promisify(execFile);
    await run(path.join(root, '.venv', 'Scripts', 'python.exe'),
        [path.join(root, 'scripts', 'windows-launcher.py'), '--backend-only', '--console'],
        { cwd: root, windowsHide: true, timeout: 40000 });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const result = await popup.evaluate(async ({ token, port }) => {
        const current = await chrome.runtime.sendMessage({ type: 'SETTINGS' });
        if (!current.ok) throw new Error(current.error);
        const saved = await chrome.runtime.sendMessage({ type: 'SAVE', settings: {
            ...current.data, backendUrl: `http://127.0.0.1:${port}`, backendToken: token,
        } });
        if (!saved.ok) throw new Error(saved.error);
        const health = await chrome.runtime.sendMessage({ type: 'HEALTH' });
        if (!health.ok) throw new Error(health.error);
        return { health: health.data, providerConfigured: Boolean(current.data.apiKey) };
    }, { token, port: config.port });
    if (!result.health.ffmpeg || !result.health.ffprobe || !result.health.js_runtime_available) throw new Error('Backend dependencies are unavailable');
    await writeFile(path.join(state, 'installation-check.json'), JSON.stringify({
        installed: true, extensionId, browser: config.browser_kind, ...result,
    }, null, 2));
    console.log(JSON.stringify({ installed: true, extensionId, browser: config.browser_kind,
        backend: `http://127.0.0.1:${config.port}`, health: result.health,
        providerConfigured: result.providerConfigured }));
} finally {
    await context?.close();
}
