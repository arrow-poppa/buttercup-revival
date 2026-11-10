import { cleanSegments } from '../subtitles/formats.js';
import { isChat, providerRouting, providerBaseUrl } from '../api/config.js';

export function cacheDescriptor(videoId, settings) {
    const { model, pin, strict } = providerRouting(settings);
    const deepinfra = settings.provider === 'deepinfra';
    const groq = settings.provider === 'groq';
    return { videoId, sourceLanguage: settings.language || 'auto', targetLanguage: settings.translate ? 'en' : 'original',
        audioTrack: settings.audioTrack || 'default', type: settings.translate ? 'translated' : 'transcribed', provider: settings.provider,
        endpoint: providerBaseUrl(settings), model, wordTimestamps: settings.wordTimestamps,
        responseFormat: groq ? 'verbose_json' : deepinfra ? 'native-json' : settings.responseFormat, prompt: settings.prompt, version: 1,
        ...(deepinfra ? { transport: 'deepinfra-native', upstreamProvider: 'deepinfra' }
            : groq ? { transport: 'groq-transcriptions', upstreamProvider: 'groq' }
                : isChat(settings) || pin ? { transport: isChat(settings) ? 'chat-completions' : 'transcriptions', upstreamProvider: pin } : {}),
        ...(strict ? { neverFallback: true } : {}) };
}

export async function cacheKey(descriptor) {
    const bytes = new TextEncoder().encode(JSON.stringify(descriptor));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

export function publicRecord(record) {
    const d = record.descriptor;
    if (!/^[A-Za-z0-9_-]{11}$/.test(d.videoId) || typeof d.model !== 'string' || d.model.length > 200) throw new Error('Invalid cache metadata');
    if (d.neverFallback !== undefined && (d.neverFallback !== true || !d.upstreamProvider || d.transport !== 'chat-completions')) throw new Error('Invalid strict routing metadata');
    if (d.transport === 'groq-transcriptions') {
        if (d.provider !== 'groq' || d.upstreamProvider !== 'groq') throw new Error('Invalid Groq cache metadata');
    } else if (d.transport === 'deepinfra-native') {
        if (d.provider !== 'deepinfra' || d.upstreamProvider !== 'deepinfra') throw new Error('Invalid DeepInfra cache metadata');
    } else if (d.transport !== undefined && (!['chat-completions', 'transcriptions'].includes(d.transport) || !['openrouter', 'custom'].includes(d.provider)
        || typeof d.upstreamProvider !== 'string' || d.upstreamProvider.length > 100
        || d.upstreamProvider && !/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(d.upstreamProvider))) throw new Error('Invalid cache routing metadata');
    return { key: record.key, descriptor: { videoId: d.videoId, sourceLanguage: d.sourceLanguage, targetLanguage: d.targetLanguage,
        audioTrack: d.audioTrack, type: d.type, provider: d.provider, model: d.model, version: d.version,
        ...(d.transport ? { transport: d.transport, upstreamProvider: d.upstreamProvider } : {}),
        ...(d.neverFallback ? { neverFallback: true } : {}) },
        createdAt: record.createdAt, revision: record.revision || 1,
        transcript: { words: cleanSegments(record.transcript.words || []), segments: cleanSegments(record.transcript.segments || []),
            ...(record.transcript.wordFallbacks ? { wordFallbacks: cleanSegments(record.transcript.wordFallbacks) } : {}),
            language: String(record.transcript.language || '').slice(0, 30) } };
}

async function database() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('buttercup-revival', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('subtitles', { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
}

export async function cacheOperation(method, value) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('subtitles', ['get', 'getAll'].includes(method) ? 'readonly' : 'readwrite');
            const request = tx.objectStore('subtitles')[method](value);
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Cache transaction aborted'));
        });
    } finally { db.close(); }
}
