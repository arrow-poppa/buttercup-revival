export const DEEPINFRA_BASE_URL = 'https://api.deepinfra.com/v1/inference';
export const DEEPINFRA_DEFAULT_MODEL = 'openai/whisper-large-v3-turbo';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_DEFAULT_MODEL = 'whisper-large-v3-turbo';

export const DEFAULTS = Object.freeze({
    uiLanguage: 'auto', enabled: true, language: '', translate: false, preferHuman: true, showOnPlayer: true, audioTrack: 'default',
    provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '', model: 'openai/whisper-large-v3', extraHeaders: {},
    openrouterMode: 'transcriptions', openrouterProvider: '', openrouterNoFallback: false,
    customMode: 'transcriptions', customProvider: '',
    deepinfraApiKey: '', deepinfraModel: DEEPINFRA_DEFAULT_MODEL,
    groqApiKey: '', groqModel: GROQ_DEFAULT_MODEL,
    wordTimestamps: true, responseFormat: 'verbose_json', supportsTranslation: false,
    wordsPerLine: 12, maxLineLength: 8, cueBreaks: 'speech', prompt: '',
    backendUrl: 'http://127.0.0.1:8767', backendToken: '',
    audioMode: 'chunks', parallelRequests: 1,
    chunkSeconds: 120, maxUploadMb: 24, timeoutSeconds: 150,
    cache: true, downloadSrt: false, saveFolder: '',
    communityUrl: '', communityRead: false, communityShare: false,
    asbplayerUrl: 'http://127.0.0.1:8766', autoSend: false, mediaId: '',
});

export function isChat(settings) {
    if (['deepinfra', 'groq'].includes(settings.provider)) return false;
    return (settings.provider === 'openrouter' ? settings.openrouterMode : settings.customMode) === 'chat';
}

export function pinnedProvider(settings) {
    if (['deepinfra', 'groq'].includes(settings.provider)) return '';
    return (settings.provider === 'openrouter' ? settings.openrouterProvider : settings.customProvider) || '';
}

export function isOpenRouter(settings) {
    if (['deepinfra', 'groq'].includes(settings.provider)) return false;
    if (settings.provider === 'openrouter') return true;
    try { return new URL(settings.baseUrl).hostname === 'openrouter.ai'; } catch { return false; }
}

export function providerModel(settings) { return settings.provider === 'groq' ? settings.groqModel : settings.provider === 'deepinfra' ? settings.deepinfraModel : settings.model; }
export function providerBaseUrl(settings) { return settings.provider === 'groq' ? GROQ_BASE_URL : settings.provider === 'deepinfra' ? DEEPINFRA_BASE_URL : settings.baseUrl; }

export function requireDeepInfraKey(settings) {
    if (!settings.deepinfraApiKey?.trim()) throw new Error('Set your DeepInfra API key first. Your OpenRouter key is stored separately.');
    return settings.deepinfraApiKey.trim();
}

export function requireGroqKey(settings) {
    if (!settings.groqApiKey?.trim()) throw new Error('Set your Groq API key first. Keys for other providers are stored separately.');
    return settings.groqApiKey.trim();
}

export function providerRouting(settings) {
    const strict = isOpenRouter(settings) && settings.openrouterNoFallback === true;
    let model = providerModel(settings).trim(), pin = pinnedProvider(settings).trim().toLowerCase();
    // This is Buttercup input shorthand, not an OpenRouter routing guarantee.
    // Preserve OpenRouter's documented model variants as part of the model ID.
    const suffix = strict && model.match(/^(.+):([a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*)$/i);
    if (suffix && !['free', 'extended', 'thinking', 'online', 'nitro', 'floor', 'exacto'].includes(suffix[2].toLowerCase())) {
        const selected = suffix[2].toLowerCase();
        if (selected.length > 100) throw new Error('Provider slug is too long.');
        if (pin && pin !== selected) throw new Error('The model provider suffix conflicts with Pin provider. Choose the same provider in both fields.');
        model = suffix[1]; pin = selected;
    }
    return { model, pin, strict };
}

export function validateRouting(settings) {
    const route = providerRouting(settings);
    if (isOpenRouter(settings) && !isChat(settings) && (route.strict || route.pin)) {
        throw new Error('Strict provider routing is unavailable on OpenRouter Audio Transcriptions. Use Chat Completions with a compatible audio model, or a direct provider API; no audio will be sent.');
    }
    if (route.strict && !route.pin) throw new Error('Never fall back requires a Pin provider, such as deepinfra, or a model:provider shorthand.');
    return route;
}

export function validateTranscription(settings) {
    const route = validateRouting(settings);
    if (settings.provider === 'groq') {
        if (!/^[A-Za-z0-9_.-]+$/.test(route.model)) throw new Error('Use a Groq model ID such as whisper-large-v3-turbo, without openai/ or a provider suffix.');
        if (settings.translate) throw new Error('The Groq preset currently supports transcription. Turn off translation to continue.');
        if (settings.language.includes('-')) throw new Error('For Groq, use a base language code such as pt instead of pt-BR.');
    }
    if (settings.provider === 'deepinfra') {
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(route.model)) throw new Error('Use a DeepInfra model ID such as openai/whisper-large-v3-turbo, without a provider suffix.');
        if (settings.translate) throw new Error('The DeepInfra preset currently supports transcription. Turn off translation to continue.');
        if (settings.language.includes('-')) throw new Error('For DeepInfra, use a base language code such as pt instead of pt-BR.');
    }
    if (isOpenRouter(settings) && isChat(settings) && /^openai\/whisper(?:-|$)/i.test(route.model)) {
        throw new Error('Whisper cannot use OpenRouter Chat Completions. Use Audio Transcriptions with automatic routing, or a direct provider API with its own key. No audio was sent.');
    }
    return route;
}

export function baseUrl(value, localOnly = false, label = 'Endereço da API') {
    let url;
    try { url = new URL(value); }
    catch { throw new Error(`${label} inválido. Informe um endereço completo, como ${localOnly ? DEFAULTS.backendUrl : 'https://seu-provedor.example/v1'}.`); }
    if (url.username || url.password || url.search || url.hash) throw new Error('URL must not contain credentials, query, or fragment');
    if (localOnly && (url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || !['', '/'].includes(url.pathname))) {
        throw new Error('Local services must use http://127.0.0.1 with an optional port');
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('Use HTTPS, or HTTP on 127.0.0.1 for a local API');
    return url.href.replace(/\/$/, '');
}

export function validateSettings(input) {
    const value = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) if (Object.hasOwn(input, key)) value[key] = input[key];
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
        if (typeof fallback === 'boolean' && typeof value[key] !== 'boolean') throw new Error(`Invalid ${key}`);
        if (typeof fallback === 'string' && typeof value[key] !== 'string') throw new Error(`Invalid ${key}`);
    }
    if (!['openrouter', 'custom', 'deepinfra', 'groq'].includes(value.provider)) throw new Error('Invalid provider');
    if (!['default', 'original'].includes(value.audioTrack)) throw new Error('Invalid audio track');
    if (!['chunks', 'whole'].includes(value.audioMode)) throw new Error('Invalid audio sending mode');
    if (!['speech', 'words'].includes(value.cueBreaks)) throw new Error('Invalid subtitle break mode');
    if (!['auto', 'en', 'pt-BR', 'es', 'ja', 'zh-CN'].includes(value.uiLanguage)) throw new Error('Invalid interface language');
    if (!['transcriptions', 'chat'].includes(value.openrouterMode)) throw new Error('Invalid OpenRouter API mode');
    if (!['transcriptions', 'chat'].includes(value.customMode)) throw new Error('Invalid custom API mode');
    for (const key of ['openrouterProvider', 'customProvider']) {
        value[key] = value[key].trim().toLowerCase();
        if (value[key] && (value[key].length > 100 || !/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(value[key]))) throw new Error('Enter a provider slug, such as groq or google-vertex');
    }
    // Presets have fixed API addresses. An unfinished Custom address must not
    // prevent the user from using DeepInfra/Groq, or erase that Custom draft.
    if (value.provider === 'openrouter') value.baseUrl = DEFAULTS.baseUrl;
    else if (value.provider === 'custom') value.baseUrl = baseUrl(value.baseUrl, false, 'Endereço da Custom API');
    value.backendUrl = baseUrl(value.backendUrl || DEFAULTS.backendUrl, true, 'Endereço do assistente local');
    value.asbplayerUrl ||= DEFAULTS.asbplayerUrl;
    if (value.autoSend) value.asbplayerUrl = baseUrl(value.asbplayerUrl, true, 'Endereço do asbplayer');
    if (value.communityUrl && (value.communityRead || value.communityShare)) {
        value.communityUrl = baseUrl(value.communityUrl, false, 'Endereço do cache comunitário');
        if (new URL(value.communityUrl).protocol !== 'https:') throw new Error('Community cache requires HTTPS');
    }
    for (const [key, min, max] of [['wordsPerLine', 1, 40], ['maxLineLength', 0, 40], ['chunkSeconds', 5, 1200], ['maxUploadMb', 1, 100], ['timeoutSeconds', 10, 600], ['parallelRequests', 1, 3]]) {
        if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error(`Invalid ${key}`);
    }
    value.saveFolder = value.saveFolder.trim();
    // The local assistant writes there; the browser itself can only use Downloads.
    if (value.saveFolder && (value.saveFolder.length > 400 || !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value.saveFolder))) throw new Error('Subtitle folder must be a full path, such as D:\\Subtitles');
    if (value.language && !/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(value.language)) throw new Error('Use a language code such as en or pt');
    if (!providerModel(value).trim() || providerModel(value).length > 200 || value.prompt.length > 896 || value.apiKey.length > 4096 || value.deepinfraApiKey.length > 4096 || value.groqApiKey.length > 4096) throw new Error('Invalid model, prompt, or key');
    validateRouting(value);
    if (value.translate && (!value.supportsTranslation || value.provider !== 'custom' || isChat(value))) throw new Error('Translation requires a custom API supporting /audio/translations');
    if (!['verbose_json', 'json'].includes(value.responseFormat)) throw new Error('Invalid response format');
    if (!value.extraHeaders || Array.isArray(value.extraHeaders) || typeof value.extraHeaders !== 'object') throw new Error('Headers must be a JSON object');
    for (const [name, header] of Object.entries(value.extraHeaders)) {
        if (!/^x-[a-z0-9-]+$/i.test(name) || typeof header !== 'string' || /[\r\n]/.test(header) || header.length > 1024) throw new Error('Additional headers must use X- names and single-line values');
    }
    return value;
}

export async function getSettings() {
    const stored = await chrome.storage.local.get('settings');
    return validateSettings({ ...DEFAULTS, ...stored.settings });
}

export function publicSettings(settings) {
    const { enabled, language, preferHuman, showOnPlayer, downloadSrt } = settings;
    return { enabled, language, preferHuman, showOnPlayer, downloadSrt };
}

export function redact(message, settings = {}) {
    let text = String(message || 'Unknown error');
    for (const secret of [settings.apiKey, settings.deepinfraApiKey, settings.groqApiKey, settings.backendToken, ...Object.values(settings.extraHeaders || {})]) {
        if (secret) text = text.split(secret).join('[redacted]');
    }
    return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]').slice(0, 1000);
}
