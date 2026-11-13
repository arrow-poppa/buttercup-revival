import { protectSettings } from '../api/storage.js';
import { getSettings, validateSettings, publicSettings, redact, isOpenRouter, validateTranscription } from '../api/config.js';
import { popupSettings, saveDraft, saveSettings, applyDraft, commitDraft, persistDraft, DRAFT_PREFIX } from '../api/settings.js';
import { backend } from '../api/backend.js';
import { assistantStatus, startAssistant, localSettings, importConnection } from '../api/assistant.js';
import { listModels } from '../api/provider.js';
import { cacheOperation } from '../cache/local.js';
import { formatTranscript } from '../subtitles/formats.js';
import { boundMedia, sendToAsbplayer } from '../integrations/asbplayer.js';
import { connections } from './connections.js';
import { setLanguage, tr, storedLanguage } from '../api/i18n.js';

const popupUrl = chrome.runtime.getURL('popup.html');
const offscreenUrl = chrome.runtime.getURL('background/offscreen.html');
const connection = connections();

async function playerInfo(tabId) {
    const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: () => {
        const player = document.getElementById('movie_player');
        const response = player?.getPlayerResponse?.();
        const current = new URL(location.href).searchParams.get('v') || location.pathname.split('/')[2];
        if (!response || response.videoDetails?.videoId !== current) return null;
        const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const audioTracks = response.captions?.playerCaptionsTracklistRenderer?.audioTracks || [];
        return { videoId: current, hasHuman: tracks.some(track => track.kind !== 'asr'),
            multipleAudio: audioTracks.length > 1, title: String(response.videoDetails?.title || '').slice(0, 300) };
    } });
    return result[0]?.result;
}

async function toggleYouTubeCaptions(tabId, restore) {
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: restore => {
        const player = document.getElementById('movie_player');
        if (restore) player?.loadModule?.('captions');
        else player?.unloadModule?.('captions');
    }, args: [restore] });
}

async function tabVideo(tabId) {
    const tab = await chrome.tabs.get(tabId), url = new URL(tab.url);
    if (url.origin !== 'https://www.youtube.com') throw new Error('Open a YouTube video first.');
    const id = url.searchParams.get('v') || url.pathname.split('/')[2];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('Open a YouTube video first.');
    return id;
}

// Messages leaving for the YouTube page are translated here: the page script
// has no access to the dictionaries or to the chosen language.
async function translator() {
    setLanguage(await storedLanguage().catch(() => 'auto'));
    return tr;
}
const CONTENT_STRINGS = ['Starting…', 'Generate better captions', 'Buttercup unavailable',
    "The extension was updated. Open the Buttercup popup to reconnect the player."];
async function contentSettings(settings) {
    await translator();
    return { ...publicSettings(settings), strings: Object.fromEntries(CONTENT_STRINGS.map(text => [text, tr(text)])) };
}
async function localStatus(status) {
    await translator();
    return { ...status, message: status.parts ? status.parts.map(tr).join(' ') : tr(status.message) };
}

async function broadcastSettings(settings) {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' }), value = await contentSettings(settings);
    for (const tab of tabs) await chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS', settings: value }).catch(() => {});
}

async function runtimeSettings() {
    // Pick up durable edits even when the popup disappeared before notifying us.
    const result = await applyDraft();
    if (!result.saved) {
        const { draft, settings: active } = await popupSettings();
        if (draft.provider !== active.provider) throw new Error('Finish configuring the selected provider before generating subtitles. No audio was sent.');
        if (isOpenRouter(draft) && draft.openrouterNoFallback === true) throw new Error(result.error || 'Fix strict provider routing before generating subtitles.');
    }
    return result.saved ? result.settings : getSettings();
}

async function handle(message, sender) {
    // The same trusted editor can run in a tab with view parameters or an anchor.
    // Keep the full extension origin and exact page path in the allowlist.
    const popup = typeof sender.url === 'string' && sender.url.split(/[?#]/, 1)[0] === popupUrl;
    const runner = sender.url === offscreenUrl;
    const content = !!sender.tab && sender.frameId === 0 && sender.url?.startsWith('https://www.youtube.com/');
    if (message.target === 'offscreen') return;
    if (runner && message.type === 'PROGRESS') {
        await chrome.storage.session.set({ [`status-${message.tabId}`]: message.status });
        await chrome.tabs.sendMessage(message.tabId, { type: 'PROGRESS', status: await localStatus(message.status) }).catch(() => {});
        return {};
    }
    if (runner && message.type === 'DELIVER') {
        if (await tabVideo(message.tabId).catch(() => '') !== message.videoId) return {};
        const delivered = await connection.deliver(message.tabId, { type: 'SUBTITLES', videoId: message.videoId, segments: message.segments, language: message.language, visible: message.visible !== false });
        if (!delivered?.received) throw new Error("The player did not receive the subtitles. Open the video and try again; the result was kept in the cache.");
        // Hidden Buttercup captions leave YouTube's caption source untouched.
        if (message.visible !== false) await toggleYouTubeCaptions(message.tabId, false);
        return {};
    }
    if (runner && message.type === 'PING') return {};
    if (runner && message.type === 'INTERNAL_SETTINGS') return runtimeSettings();
    if (runner && message.type === 'DOWNLOAD') {
        if (!message.url.startsWith(`blob:${chrome.runtime.getURL('')}`) || !/^\[[A-Za-z0-9_-]{11}\](___[^<>:"/\\|?*\x00-\x1f]{1,150})?\.(srt|vtt)$/.test(message.filename)) throw new Error('Invalid subtitle download');
        return chrome.downloads.download({ url: message.url, filename: message.filename, saveAs: false, conflictAction: 'overwrite' });
    }
    if (!popup && !content) throw new Error('Untrusted extension caller');
    if (message.type === 'WORKER_READY') return { ready: true };
    if (popup && message.type === 'POPUP_SETTINGS') return popupSettings();
    // Connecting the local helper must also work with an unfinished provider
    // draft. These actions neither validate a model nor upload audio.
    if (popup && message.type === 'BACKEND_STATUS') return assistantStatus((await popupSettings()).draft);
    if (popup && ['START_BACKEND', 'IMPORT_BACKEND'].includes(message.type)) {
        const next = message.type === 'IMPORT_BACKEND' ? importConnection(message.connection) : await startAssistant();
        await persistDraft(next);
        await applyDraft();
        return assistantStatus(next);
    }
    if (popup && message.type === 'HEALTH') return backend(localSettings((await popupSettings()).draft), '/health');
    if (popup && message.type === 'SAVE_DRAFT') {
        const result = await saveDraft(message.draft);
        if (result.saved) await broadcastSettings(result.settings);
        return { saved: result.saved, error: result.error };
    }
    if (popup && message.type === 'APPLY_DRAFT') {
        const result = await applyDraft();
        if (result.saved) await broadcastSettings(result.settings);
        return { saved: result.saved, error: result.error };
    }
    if (popup && message.type === 'COMMIT_DRAFT') {
        const next = await commitDraft();
        await broadcastSettings(next);
        return next;
    }
    if (popup && message.type === 'SAVE') {
        const next = message.useDraft === true ? await commitDraft() : await saveSettings(message.settings);
        await broadcastSettings(next);
        return next;
    }
    const settings = await runtimeSettings();
    if (message.type === 'PUBLIC_SETTINGS') return contentSettings(settings);
    if (content && message.type === 'METADATA') return playerInfo(sender.tab.id);
    if (content && message.type === 'RESTORE') { await toggleYouTubeCaptions(sender.tab.id, true); return {}; }
    if (content && message.type === 'HIDE_YOUTUBE_CAPTIONS') { await toggleYouTubeCaptions(sender.tab.id, false); return {}; }
    if (message.type === 'GENERATE') {
        validateTranscription(settings);
        const tabId = content ? sender.tab.id : message.tabId;
        const videoId = await tabVideo(tabId);
        if (!settings.enabled) throw new Error('Buttercup is disabled.');
        const info = await playerInfo(tabId);
        if (!info) throw new Error('The YouTube player is still loading. Try again.');
        if (settings.preferHuman && info.hasHuman) throw new Error('Human captions are available. Turn off “Prefer human captions” to replace them.');
        if (info.multipleAudio && settings.audioTrack !== 'original') throw new Error('Multiple audio tracks detected. Select Original audio in General to transcribe the original track.');
        await connection.content(tabId, videoId);
        return connection.sendOffscreen({ type: 'RUN', tabId, videoId, title: info.title });
    }
    if (message.type === 'CANCEL') {
        if (!await connection.hasOffscreen()) return {};
        return connection.sendOffscreen({ type: 'CANCEL', tabId: content ? sender.tab.id : message.tabId });
    }
    if (message.type === 'STATUS') {
        const key = `status-${content ? sender.tab.id : message.tabId}`;
        const status = (await chrome.storage.session.get(key))[key] || { stage: 'idle', message: 'Ready' };
        return content ? localStatus(status) : status;
    }
    if (!popup) throw new Error('This action is available only in the Buttercup popup');
    switch (message.type) {
        case 'SETTINGS': return settings;
        case 'COOKIE_STATUS': return backend(settings, '/cookies/status');
        case 'COOKIE_IMPORT': return backend(settings, '/cookies/import', { method: 'POST', body: JSON.stringify({ content: message.content, persist: message.persist === true }) });
        case 'COOKIE_DELETE': return backend(settings, '/cookies', { method: 'DELETE' });
        case 'COOKIE_TOGGLE': return backend(settings, '/cookies', { method: 'PATCH', body: JSON.stringify({ enabled: message.enabled === true }) });
        case 'MODELS': return listModels(message.settings ? validateSettings(message.settings) : settings);
        case 'CACHE_CLEAR': await cacheOperation('clear'); return {};
        case 'TRACKS': {
            const records = await cacheOperation('getAll');
            return records.filter(record => record.descriptor.videoId === message.videoId).map(record => ({ key: record.key, language: record.transcript.language || record.descriptor.sourceLanguage, model: record.descriptor.model, target: record.descriptor.targetLanguage,
                transport: record.descriptor.transport || 'transcriptions', upstreamProvider: record.descriptor.upstreamProvider || '', audioTrack: record.descriptor.audioTrack || 'default' }));
        }
        case 'ASB_STATUS': return boundMedia(settings);
        case 'ASB_SEND': {
            if (message.key) {
                const record = await cacheOperation('get', message.key);
                if (!record) throw new Error('Cached track is unavailable');
                return sendToAsbplayer(settings, formatTranscript(record.transcript, settings), `${record.descriptor.videoId}.srt`);
            }
            return connection.sendOffscreen({ type: 'SEND', tabId: message.tabId, videoId: await tabVideo(message.tabId) });
        }
        case 'EXPORT': {
            // The open video names the file when an older cached record has no title.
            const page = message.tabId ? await playerInfo(message.tabId).catch(() => null) : null;
            return connection.sendOffscreen({ ...message, ...(message.key ? {} : { videoId: await tabVideo(message.tabId) }),
                ...(page ? { page: { videoId: page.videoId, title: page.title } } : {}) });
        }
        case 'PROVIDER_TEST': return connection.sendOffscreen(message);
        default: throw new Error('Unknown Buttercup action');
    }
}

// Content scripts need only public settings; keys remain in trusted extension contexts.
const ready = protectSettings();
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.keys(changes).some(key => key.startsWith(DRAFT_PREFIX))) return;
    // Storage events wake the worker even if the popup has already closed.
    ready.then(() => applyDraft()).then(result => {
        if (result.saved) return broadcastSettings(result.settings);
    }).catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.target === 'offscreen') return false;
    ready.then(() => handle(message, sender)).then(data => respond({ ok: true, data })).catch(async error => {
        const settings = await getSettings().catch(() => ({}));
        await translator().catch(() => {});
        respond({ ok: false, error: tr(redact(error.message, settings)) });
    });
    return true;
});

chrome.tabs.onRemoved.addListener(async tabId => {
    if (await connection.hasOffscreen()) connection.sendOffscreen({ type: 'CANCEL', tabId, forget: true }).catch(() => {});
    chrome.storage.session.remove(`status-${tabId}`);
});

// Existing YouTube documents do not receive manifest content scripts on reload.
ready.then(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    // Legacy pages are refreshed only when the user requests generation.
    await Promise.allSettled(tabs.filter(tab => !tab.discarded).map(tab => connection.content(tab.id, undefined, false)));
}).catch(() => {});
