import { redact } from '../api/config.js';
import { processVideo } from '../api/transcription.js';
import { transcribe } from '../api/provider.js';
import { backend } from '../api/backend.js';
import { formatTranscript, normalize, exportSubtitles, subtitleFilename } from '../subtitles/formats.js';
import { cacheOperation, cacheDescriptor, cacheKey } from '../cache/local.js';
import { sendToAsbplayer } from '../integrations/asbplayer.js';
import { OFFSCREEN_PROTOCOL } from './connections.js';

const running = new Map(), results = new Map();
// Offscreen documents expose only chrome.runtime. Storage access belongs to the worker.
async function getSettings() {
    const response = await chrome.runtime.sendMessage({ type: 'INTERNAL_SETTINGS' });
    if (!response?.ok) throw new Error(response?.error || 'Extension configuration unavailable');
    return response.data;
}
function status(tabId, value) { return chrome.runtime.sendMessage({ type: 'PROGRESS', tabId, status: value }); }
const ping = setInterval(() => { if (running.size) chrome.runtime.sendMessage({ type: 'PING' }).catch(() => {}); }, 20000);

async function download(settings, segments, record, format, title = record.title) {
    const filename = subtitleFilename(record.descriptor.videoId, title, format), content = exportSubtitles(segments, format);
    if (settings.saveFolder) {
        // A browser can write only to its Downloads folder; the assistant is local.
        try { return await backend(settings, '/subtitles/save', { method: 'POST', body: JSON.stringify({ folder: settings.saveFolder, filename, content }) }); }
        catch (error) {
            if (/HTTP 40[45]/.test(error.message)) throw new Error('Restart the local Buttercup assistant to save subtitles into a folder.');
            throw error;
        }
    }
    // text/plain makes Chromium replace .srt/.vtt with .txt on some platforms.
    const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
    const result = await chrome.runtime.sendMessage({ type: 'DOWNLOAD', url, filename });
    if (!result.ok) { URL.revokeObjectURL(url); throw new Error(result.error); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return {};
}

async function run(tabId, videoId, controller, title) {
    let settings = {};
    try {
        settings = await getSettings();
        const result = await processVideo(videoId, settings, controller.signal, value => status(tabId, value).catch(() => {}));
        controller.signal.throwIfAborted();
        if (title && result.record.title !== title) {
            // Kept beside the transcript so later exports can name the file.
            result.record.title = title;
            if (settings.cache) await cacheOperation('put', result.record).catch(() => {});
        }
        results.set(tabId, result);
        // Each note is a message of its own, so the interface can translate it.
        const notes = [...(result.record.transcript.warnings || [])];
        // asbplayer receives its own copy first: it must not depend on whether
        // Buttercup's captions reach, or are shown in, the YouTube player.
        if (settings.autoSend) {
            try { await sendToAsbplayer(settings, result.segments, `${videoId}.srt`); }
            catch (error) { notes.push(`Automatic send to asbplayer failed: ${error.message} Subtitles remain available in Buttercup.`); }
        }
        const visible = settings.showOnPlayer !== false;
        const delivered = await chrome.runtime.sendMessage({ type: 'DELIVER', tabId, videoId, visible, segments: result.segments, language: settings.translate ? 'en' : result.record.transcript.language || settings.language || 'und' });
        if (!delivered.ok && visible) throw new Error(delivered.error);
        if (!visible) notes.push('Not shown on the video (setting is off); use the BC button, asbplayer or the downloads.');
        if (settings.downloadSrt) {
            try {
                const saved = await download(settings, result.segments, result.record, 'srt');
                if (saved.path) notes.push(`Saved: ${saved.path}`);
            } catch (error) { notes.push(`Saving the SRT failed: ${error.message}`); }
        }
        const parts = [`Subtitles ready (${result.source}).`, ...notes];
        await status(tabId, { stage: 'ready', message: parts.join(' '), parts, source: result.source });
    } catch (error) {
        await status(tabId, { stage: controller.signal.aborted ? 'cancelled' : 'error', message: controller.signal.aborted ? 'Cancelled' : redact(error.message, settings) });
    } finally { running.delete(tabId); }
}

async function handle(message) {
    const settings = await getSettings(), tabId = message.tabId;
    if (message.type === 'RUN') {
        if (running.has(tabId)) throw new Error('This tab already has a running transcription');
        const controller = new AbortController(); running.set(tabId, controller);
        run(tabId, message.videoId, controller, message.title).catch(() => {});
        return { started: true };
    }
    // Cancelling stops work in progress; finished subtitles stay available to
    // exports and asbplayer until the tab closes.
    if (message.type === 'CANCEL') { running.get(tabId)?.abort(); if (message.forget) results.delete(tabId); return {}; }
    if (message.type === 'PROVIDER_TEST') {
        // Real multipart request using a short user-selected sample; can incur provider usage.
        const audio = new Blob([Uint8Array.from(atob(message.audio), ch => ch.charCodeAt(0))], { type: message.mime || 'audio/mpeg' });
        const transcript = normalize(await transcribe(settings, audio));
        const segments = formatTranscript(transcript, settings);
        return { compatible: true, segments: segments.length, words: transcript.words.length, warnings: transcript.warnings };
    }
    let record;
    if (message.key) record = await cacheOperation('get', message.key);
    else {
        record = results.get(tabId)?.record;
        if (record && message.videoId && record.descriptor.videoId !== message.videoId) record = null;
        // This document's memory is lost when it restarts; the cache is not.
        if (!record && message.videoId) record = await cacheOperation('get', await cacheKey(cacheDescriptor(message.videoId, settings)));
    }
    if (!record) throw new Error('Generate or select cached subtitles first');
    const segments = formatTranscript(record.transcript, settings);
    if (message.type === 'SEND') return sendToAsbplayer(settings, segments, `${record.descriptor.videoId}.srt`);
    if (message.type === 'EXPORT') {
        const title = record.title || (message.page?.videoId === record.descriptor.videoId ? message.page.title : '');
        return download(settings, segments, record, message.format, title);
    }
    throw new Error('Unknown background action');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
    // Chrome may omit sender.url for a service worker. Our own ID and no tab identify
    // a trusted extension context; content scripts always have sender.tab.
    if (sender.id !== chrome.runtime.id || sender.tab || message.target !== 'offscreen') return false;
    if (message.type === 'BUTTERCUP_READY') {
        respond({ ready: true, protocol: OFFSCREEN_PROTOCOL });
        return false;
    }
    handle(message).then(data => respond({ ok: true, data })).catch(async error => respond({ ok: false, error: redact(error.message, await getSettings().catch(() => ({}))) }));
    return true;
});
