import { DEFAULTS, baseUrl } from './config.js';
import { backend } from './backend.js';

export const NATIVE_HOST = 'app.buttercup.assistant';

export function localSettings(draft) {
    return {
        backendUrl: baseUrl(draft.backendUrl?.trim() || DEFAULTS.backendUrl, true, "Local assistant address"),
        backendToken: draft.backendToken?.trim() || '',
    };
}

export async function assistantStatus(draft) {
    try {
        const settings = localSettings(draft);
        if (!settings.backendToken) return { state: 'pair', message: "Connect the local assistant to prepare the audio of the videos." };
        const health = await backend(settings, '/health', { signal: AbortSignal.timeout(3000) });
        if (health.status !== 'ok' || !health.version) return { state: 'offline', message: "The local assistant could not be recognised. Click “Start and connect”." };
        if (health.ffmpeg === false || health.ffprobe === false || health.js_runtime_available === false) {
            return { state: 'dependencies', message: "The assistant started, but audio components are missing. Run the installation again.", health };
        }
        return { state: 'online', message: "Ready to prepare the audio of the videos.", health };
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
    if (!result?.ok) throw new Error(result?.error || "The assistant could not be started. Run the assistant setup in the project folder.");
    const settings = localSettings(result);
    if (settings.backendToken.length < 32 || settings.backendToken.length > 4096) throw new Error("The assistant returned an invalid connection. Run the setup again.");
    return settings;
}
