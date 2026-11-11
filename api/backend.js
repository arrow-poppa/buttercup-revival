import { baseUrl } from './config.js';

export async function backend(settings, path, options = {}) {
    const response = await fetch(baseUrl(settings.backendUrl, true, "Local assistant address") + path, {
        ...options, redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { 'Authorization': `Bearer ${settings.backendToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        signal: options.signal || AbortSignal.timeout(15000),
    }).catch(error => {
        if (error.name === 'AbortError') throw error;
        throw new Error("The local assistant is off. Open Buttercup and click “Start and connect”.");
    });
    if (!response.ok) {
        if (response.status === 401) throw new Error("The local assistant needs to be reconnected. Click “Start and connect” in Buttercup.");
        const detail = await response.json().catch(() => ({}));
        throw new Error(`Backend HTTP ${response.status}: ${typeof detail.detail === 'string' ? detail.detail : 'Request rejected'}`);
    }
    return options.blob ? response.blob() : response.json();
}
