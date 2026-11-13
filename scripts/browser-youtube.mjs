// Optional live YouTube DOM test using explicitly synthetic cues, without API credentials.
import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results'); await mkdir(output, { recursive: true });
if (await realpath(output) !== path.join(await realpath(root), 'test-results')) throw new Error('Test artifacts must stay inside the project');
const profile = await mkdtemp(path.join(output, 'youtube-browser-'));
const extension = path.join(root, 'dist', 'chromium');
let context;
const report = { realYoutube: true, syntheticCues: true, transcriptionProviderUsed: false };
try {
    context = await chromium.launchPersistentContext(profile, {
        headless: true, ...(process.env.BUTTERCUP_BROWSER ? { executablePath: process.env.BUTTERCUP_BROWSER } : { channel: 'chromium' }),
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--autoplay-policy=no-user-gesture-required'],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#buttercup-button', { timeout: 30000 });
    const metadata = await page.evaluate(() => {
        const player = document.getElementById('movie_player'), response = player?.getPlayerResponse?.();
        return { videoId: response?.videoDetails?.videoId, hasVideo: !!player?.querySelector('video'),
            tracks: response?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length || 0 };
    });
    assert.equal(metadata.videoId, 'jNQXAC9IVRw'); assert.equal(metadata.hasVideo, true);
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.evaluate(async () => {
        const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'SUBTITLES', videoId: 'jNQXAC9IVRw', language: 'en',
            segments: [{ start: 0, end: 18, text: 'Buttercup integration test (synthetic caption)' }] });
    });
    await page.waitForFunction(() => [...document.querySelector('#movie_player video').textTracks].some(track => track.label === 'Buttercup' && track.mode === 'showing' && track.cues?.length === 1));
    report.metadata = metadata;
    report.browser = await context.browser()?.version();
    report.passed = true;
    console.log('Live YouTube DOM passed: actual player metadata, BC control and native text track with synthetic cues. No provider transcription was performed.');
} catch (error) {
    report.passed = false; report.error = error.message;
    console.log(JSON.stringify(report)); process.exitCode = 1;
} finally {
    await context?.close();
    await writeFile(path.join(output, 'browser-youtube.json'), JSON.stringify(report, null, 2));
    if (path.dirname(profile) === output) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
