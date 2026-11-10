import { baseUrl } from './config.js';

export async function backend(settings, path, options = {}) {
    const response = await fetch(baseUrl(settings.backendUrl, true, 'Endereço do assistente local') + path, {
        ...options, redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { 'Authorization': `Bearer ${settings.backendToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        signal: options.signal || AbortSignal.timeout(15000),
    }).catch(error => {
        if (error.name === 'AbortError') throw error;
        throw new Error('O assistente local está desligado. Abra o Buttercup e clique em “Iniciar e conectar”.');
    });
    if (!response.ok) {
        if (response.status === 401) throw new Error('O assistente local precisa ser reconectado. Clique em “Iniciar e conectar” no Buttercup.');
        const detail = await response.json().catch(() => ({}));
        throw new Error(`Backend HTTP ${response.status}: ${typeof detail.detail === 'string' ? detail.detail : 'Request rejected'}`);
    }
    return options.blob ? response.blob() : response.json();
}
