import { backend } from './backend.js';
import { validateTranscription, requireDeepInfraKey, requireGroqKey } from './config.js';
import { transcribe } from './provider.js';
import { cacheDescriptor, cacheKey, cacheOperation, publicRecord } from '../cache/local.js';
import { normalize, mergeChunks, formatTranscript } from '../subtitles/formats.js';

const pause = (ms, signal) => new Promise((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
});

async function community(settings, key, record) {
    const response = await fetch(`${settings.communityUrl}/subtitles/${key}`, {
        method: record ? 'PUT' : 'GET',
        ...(record ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(publicRecord(record)) } : {}),
        credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Community cache HTTP ${response.status}`);
    return response.json();
}

function formatted(record, settings, source) {
    const formatWarnings = [];
    const segments = formatTranscript(record.transcript, settings, formatWarnings);
    return { record, segments, source, formatWarnings };
}

export async function processVideo(videoId, settings, signal, progress, { ignoreCache = false } = {}) {
    validateTranscription(settings);
    const descriptor = cacheDescriptor(videoId, settings), key = await cacheKey(descriptor);
    let record = settings.cache && !ignoreCache ? await cacheOperation('get', key) : null;
    // Cached segment-only records can be reformatted locally. A paid retry
    // requires the user's explicit Regenerate action, including old records.
    if (!record && !ignoreCache && settings.communityRead && settings.communityUrl) {
        try {
            const shared = await community(settings, key);
            if (shared) {
                const checked = publicRecord(shared);
                const expected = publicRecord({ key, descriptor, transcript: { words: [], segments: [] } }).descriptor;
                if (checked.key !== key || JSON.stringify(checked.descriptor) !== JSON.stringify(expected)) throw new Error('Invalid shared metadata');
                const candidate = { ...checked, descriptor };
                formatTranscript(candidate.transcript, settings);
                record = candidate;
                if (settings.cache) await cacheOperation('put', record);
            }
        } catch { progress({ stage: 'cache', message: 'Community cache unavailable; continuing locally.' }); }
    }
    if (record) return formatted(record, settings, 'cache');
    signal.throwIfAborted();
    if (settings.provider === 'openrouter' && !settings.apiKey) throw new Error('Set your OpenRouter API key first.');
    if (settings.provider === 'deepinfra') requireDeepInfraKey(settings);
    if (settings.provider === 'groq') requireGroqKey(settings);
    if (!settings.backendToken) throw new Error('Pair the local backend first.');
    const whole = settings.audioMode === 'whole';
    if (settings.audioTrack === 'original' || whole) {
        const health = await backend(settings, '/health', { signal });
        if (settings.audioTrack === 'original' && !health.audio_track_selection?.includes('original')) throw new Error('Restart the local Buttercup backend to enable original audio selection.');
        if (whole && !health.audio_modes?.includes('whole')) throw new Error('Restart the local Buttercup assistant to enable whole-audio uploads. No audio was sent.');
    }
    let job;
    try {
        progress({ stage: 'extracting', message: 'Extracting YouTube audio…' });
        job = await backend(settings, '/jobs/extract', { method: 'POST', body: JSON.stringify({
            video: videoId, chunk_seconds: settings.chunkSeconds, max_upload_bytes: settings.maxUploadMb * 1000000,
            ...(whole ? { audio_mode: 'whole' } : {}),
            ...(settings.audioTrack === 'original' ? { audio_track: 'original' } : {}) }), signal });
        while (!['ready', 'error', 'cancelled'].includes(job.state)) {
            await pause(700, signal);
            job = await backend(settings, `/jobs/${job.id}`, { signal });
            progress({ stage: job.state, message: job.state === 'converting' ? 'Converting and splitting audio…' : 'Extracting YouTube audio…', ...job.progress });
        }
        if (job.state !== 'ready') throw new Error(job.error?.message || 'Extraction cancelled');
        if (settings.audioTrack === 'original' && job.audio_track !== 'original') throw new Error('Backend did not confirm original audio selection. No audio was sent to the provider.');
        if (whole && (job.audio_mode !== 'whole' || job.chunks?.length !== 1 || job.chunks[0].offset !== 0)) throw new Error('Backend did not confirm a whole-audio upload. No audio was sent to the provider.');
        const parts = await transcribeChunks(job.chunks, settings.parallelRequests || 1, signal, async (chunk, requestSignal, done) => {
            progress({ stage: 'transcribing', message: whole ? 'Transcribing the whole audio in one request…'
                : `Transcribing part ${chunk.index + 1}/${job.chunks.length} (${Math.round(chunk.offset)}–${Math.round(chunk.offset + chunk.duration)}s${chunk.size ? `, ${(chunk.size / 1000000).toFixed(2)} MB` : ''})…`, progress: done / job.chunks.length });
            const audio = await backend(settings, `/jobs/${job.id}/chunks/${chunk.index}`, { blob: true, signal: requestSignal });
            requestSignal.throwIfAborted();
            const transcript = normalize(await transcribe(settings, audio, requestSignal));
            if (!transcript.words.length && !transcript.segments.length) throw new Error('Provider returned text without timestamps; synchronized captions require another model.');
            return { offset: chunk.offset, duration: chunk.duration, transcript };
        });
        progress({ stage: 'processing', message: 'Combining subtitle timestamps…' });
        record = { key, descriptor, transcript: mergeChunks(parts), createdAt: new Date().toISOString(), revision: 2 };
        const result = formatted(record, settings, 'transcription');
        if (settings.cache) await cacheOperation('put', record);
        if (settings.communityShare && settings.communityUrl) {
            try { await community(settings, key, record); }
            catch { progress({ stage: 'cache', message: 'Subtitles ready; community upload failed.' }); }
        }
        return result;
    } finally {
        if (job?.id) await backend(settings, `/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
    }
}

// A bounded queue preserves original chunk order even when responses finish out
// of order. Failures abort in-flight work and stop the queue; no request is retried.
async function transcribeChunks(chunks, concurrency, signal, operation) {
    if (!Array.isArray(chunks) || !chunks.length) throw new Error('The backend returned no audio parts.');
    const stop = new AbortController(), combined = AbortSignal.any([signal, stop.signal]);
    const parts = new Array(chunks.length);
    let cursor = 0, completed = 0, failure;
    const worker = async () => {
        while (!combined.aborted && cursor < chunks.length) {
            const index = cursor++;
            try {
                parts[index] = await operation(chunks[index], combined, completed);
                completed++;
            } catch (error) { failure ||= error; stop.abort(); return; }
        }
    };
    await Promise.allSettled(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
    if (failure) throw failure;
    signal.throwIfAborted();
    return parts;
}
