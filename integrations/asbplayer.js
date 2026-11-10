import { baseUrl } from '../api/config.js';
import { exportSubtitles } from '../subtitles/formats.js';

export function subtitlePayload(segments, name, mediaId = '') {
    const bytes = new TextEncoder().encode(exportSubtitles(segments)); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { files: [{ name, base64: btoa(binary) }], ...(mediaId ? { mediaId } : {}) };
}

async function request(settings, path, payload) {
    const response = await fetch(baseUrl(settings.asbplayerUrl, true, 'Endereço do asbplayer') + '/asbplayer/' + path, {
        method: payload ? 'POST' : 'GET', ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(10000), credentials: 'omit', redirect: 'error',
    }).catch(() => { throw new Error('asbplayer is unavailable. Start its official local WebSocket server on port 8766.'); });
    if (!response.ok) throw new Error(`asbplayer HTTP ${response.status}`);
    // Loading subtitles is a command: a successful response may have no body.
    // Only the bound-media query needs JSON data from the server.
    if (payload) return { accepted: true };
    return response.json().catch(() => { throw new Error('asbplayer returned an invalid media list. Check the local server address and version.'); });
}

export function boundMedia(settings) { return request(settings, 'bound-media'); }
export function sendToAsbplayer(settings, segments, name) { return request(settings, 'load-subtitles', subtitlePayload(segments, name, settings.mediaId)); }
