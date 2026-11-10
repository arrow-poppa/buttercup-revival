import { DEFAULTS, baseUrl } from './config.js';
import { backend } from './backend.js';

export const NATIVE_HOST = 'app.buttercup.assistant';

export function localSettings(draft) {
    return {
        backendUrl: baseUrl(draft.backendUrl?.trim() || DEFAULTS.backendUrl, true, 'Endereço do assistente local'),
        backendToken: draft.backendToken?.trim() || '',
    };
}

export async function assistantStatus(draft) {
    try {
        const settings = localSettings(draft);
        if (!settings.backendToken) return { state: 'pair', message: 'Conecte o assistente local para preparar o áudio dos vídeos.' };
        const health = await backend(settings, '/health', { signal: AbortSignal.timeout(3000) });
        if (health.status !== 'ok' || !health.version) return { state: 'offline', message: 'Não foi possível reconhecer o assistente local. Clique em “Iniciar e conectar”.' };
        if (health.ffmpeg === false || health.ffprobe === false || health.js_runtime_available === false) {
            return { state: 'dependencies', message: 'O assistente abriu, mas faltam componentes de áudio. Execute a instalação novamente.', health };
        }
        return { state: 'online', message: 'Pronto para preparar o áudio dos vídeos.', health };
    } catch (error) {
        return { state: 'offline', message: error.message };
    }
}

export async function startAssistant(send = message => chrome.runtime.sendNativeMessage(NATIVE_HOST, message)) {
    let result;
    try { result = await send({ action: 'start' }); }
    catch {
        throw new Error('The assistant is not installed for this browser yet. Run “Install Buttercup” in the Buttercup folder, then try again.');
    }
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível iniciar o assistente. Abra “Iniciar Buttercup” na pasta do projeto.');
    const settings = localSettings(result);
    if (settings.backendToken.length < 32 || settings.backendToken.length > 4096) throw new Error('O assistente retornou uma conexão inválida. Execute a configuração novamente.');
    return settings;
}
