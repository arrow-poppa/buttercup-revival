import { DEEPINFRA_BASE_URL, redact, validateTranscription, requireDeepInfraKey } from './config.js';
import { audioExtension } from './audio.js';

export async function transcribeDeepInfra(settings, audio, signal) {
    const { model } = validateTranscription(settings);
    const key = requireDeepInfraKey(settings);
    const body = new FormData();
    const extension = audioExtension(audio);
    body.append('audio', audio, `audio.${extension}`);
    // DeepInfra's native ASR schema exposes these fields for Whisper, Qwen ASR,
    // Voxtral and the other ASR catalog models. Request timing for all families.
    body.append('task', 'transcribe');
    body.append('chunk_level', settings.wordTimestamps ? 'word' : 'segment');
    if (settings.prompt) body.append('initial_prompt', settings.prompt);
    if (settings.language) body.append('language', settings.language);
    const timeout = AbortSignal.timeout(settings.timeoutSeconds * 1000);
    const response = await fetch(`${DEEPINFRA_BASE_URL}/${model.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        credentials: 'omit', redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const detail = error.error?.message || error.error || error.detail || response.statusText;
        throw new Error(redact(`DeepInfra HTTP ${response.status}: ${typeof detail === 'string' ? detail : 'Request rejected'}`, settings));
    }
    return response.json().catch(() => { throw new Error('DeepInfra returned an incomplete or invalid JSON transcript.'); });
}

export async function deepinfraModels() {
    // Public catalog: no key or transcription content is needed for discovery.
    const response = await fetch('https://api.deepinfra.com/models/list', {
        credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`DeepInfra model discovery HTTP ${response.status}`);
    const models = await response.json();
    if (!Array.isArray(models)) throw new Error('DeepInfra returned an invalid model catalog. You can type a model ID manually.');
    return [...new Set(models.filter(model => model.type === 'automatic-speech-recognition' && !model.deprecated)
        .map(model => model.model_name).filter(name => typeof name === 'string'))];
}
