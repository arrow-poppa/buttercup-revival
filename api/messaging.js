import { isChat, providerRouting, providerBaseUrl } from './config.js';
import { popupSettings, draftSettings } from './settings.js';

export class ExtensionUpdateRequired extends Error {
    constructor() {
        super("The extension needs to finish updating. Click Reload extension; your settings stay saved.");
        this.code = 'BUTTERCUP_UPDATE_REQUIRED';
    }
}

export async function request(message) {
    let result;
    try { result = await chrome.runtime.sendMessage(message); }
    catch (error) {
        if (/Extension context invalidated|Receiving end does not exist|Could not establish connection/i.test(error.message)) throw new ExtensionUpdateRequired();
        throw error;
    }
    // Worker/offscreen responses may be nested; requests are never replayed here.
    while (result && Object.hasOwn(result, 'ok')) {
        if (!result.ok) {
            const detail = String(result.error || 'Buttercup request failed');
            if (/^Unknown (Buttercup|background) action\b/i.test(detail)) throw new ExtensionUpdateRequired();
            throw new Error(detail);
        }
        result = result.data;
    }
    return result;
}

function route(settings) {
    if (!settings || typeof settings !== 'object') return '';
    let selection;
    try { selection = providerRouting(settings); } catch { return ''; }
    const { model, pin, strict } = selection;
    return JSON.stringify([settings.provider, providerBaseUrl(settings), model, isChat(settings), pin, strict, settings.audioTrack || 'default',
        settings.audioMode || 'chunks', settings.parallelRequests || 1]);
}

export async function saveDraftWithWorker(send = request) {
    // SAVE exists in earlier builds. New workers commit the latest durable draft;
    // older workers receive a complete snapshot using the same stable command.
    for (let attempt = 0; attempt < 3; attempt++) {
        const expected = draftSettings((await popupSettings()).draft);
        const applied = await send({ type: 'SAVE', settings: expected, useDraft: true });
        const latest = draftSettings((await popupSettings()).draft);
        if (route(latest) !== route(expected)) continue;
        // Never proceed to a paid request if an older worker dropped the chat
        // mode or provider pin. Reloading updates all extension components.
        if (route(applied) !== route(expected)) throw new ExtensionUpdateRequired();
        return applied;
    }
    throw new Error('Settings changed while saving. Try the action again.');
}
