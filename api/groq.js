import { GROQ_BASE_URL, redact, validateTranscription, requireGroqKey } from './config.js';
import { audioExtension } from './audio.js';

export async function transcribeGroq(settings, audio, signal) {
    const { model } = validateTranscription(settings);
    const key = requireGroqKey(settings);
    const body = new FormData();
    const extension = audioExtension(audio);
    body.append('file', audio, `audio.${extension}`);
    body.append('model', model);
    body.append('response_format', 'verbose_json');
    body.append('timestamp_granularities[]', 'segment');
    if (settings.wordTimestamps) body.append('timestamp_granularities[]', 'word');
    if (settings.language) body.append('language', settings.language);
    if (settings.prompt) body.append('prompt', settings.prompt);
    const timeout = AbortSignal.timeout(settings.timeoutSeconds * 1000);
    const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        credentials: 'omit', redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const detail = error.error?.message || error.error || error.detail || response.statusText;
        throw new Error(redact(`Groq HTTP ${response.status}: ${typeof detail === 'string' ? detail : 'Request rejected'}`, settings));
    }
    return response.json().catch(() => { throw new Error('Groq returned an incomplete or invalid JSON transcript.'); });
}

export async function groqModels(settings) {
    const key = requireGroqKey(settings);
    const response = await fetch(`${GROQ_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Groq model discovery HTTP ${response.status}`);
    const { data } = await response.json();
    if (!Array.isArray(data)) throw new Error('Groq returned an invalid model catalog. You can type a model ID manually.');
    return [...new Set(data.filter(model => model.active !== false && (
        /^(?:distil-)?whisper-/i.test(model.id || '')
        || ['transcription', 'automatic-speech-recognition'].includes(model.task || model.type)
        || Array.isArray(model.supported_endpoints) && model.supported_endpoints.some(endpoint => /(?:^|\/)audio\/transcriptions$/.test(endpoint))
    )).map(model => model.id).filter(id => typeof id === 'string'))];
}
