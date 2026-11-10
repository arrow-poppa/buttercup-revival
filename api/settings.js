import { DEFAULTS, validateSettings, redact } from './config.js';

export const DRAFT_PREFIX = 'draftSetting:';
// The popup immediately persists individual fields. Only activation of a valid
// configuration is serialized by the worker, independently of the popup lifetime.
let writes = Promise.resolve();
function enqueue(operation) {
    const result = writes.then(operation);
    writes = result.catch(() => {});
    return result;
}

export function formDraft(settings) {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => {
        const raw = settings[key] ?? fallback;
        const value = typeof fallback === 'boolean' ? (typeof raw === 'boolean' ? raw : fallback)
            : key === 'extraHeaders' ? (typeof raw === 'string' ? raw : JSON.stringify(raw))
            : typeof raw === 'string' || typeof raw === 'number' ? String(raw) : String(fallback);
        return [key, value];
    }));
}

export function draftSettings(draft) {
    const value = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
        const raw = draft[key];
        if (typeof fallback === 'boolean') value[key] = raw;
        else if (typeof fallback === 'number') value[key] = raw.trim() === '' ? NaN : Number(raw);
        else if (key === 'extraHeaders') {
            try { value[key] = JSON.parse(raw || '{}'); }
            catch {
                if (['deepinfra', 'groq'].includes(draft.provider)) value[key] = {};
                else throw new Error('Additional X- headers must contain valid JSON.');
            }
        } else value[key] = raw.trim();
    }
    return validateSettings(value);
}

async function storedSettings() {
    // Editing must work even when older saved settings fail today's validation.
    // Transcription still uses getSettings(), which validates before any request.
    const stored = await chrome.storage.local.get(['settings', 'settingsDraft', ...Object.keys(DEFAULTS).map(key => DRAFT_PREFIX + key)]);
    const settings = { ...DEFAULTS, ...stored.settings };
    const draft = { ...formDraft(settings), ...stored.settingsDraft };
    for (const key of Object.keys(DEFAULTS)) if (stored[DRAFT_PREFIX + key] !== undefined) draft[key] = stored[DRAFT_PREFIX + key];
    return { settings, draft };
}

// A backup carries what the user typed. The pairing with the local assistant
// belongs to this computer and is restored by "Start and connect".
const LOCAL_ONLY = ['backendUrl', 'backendToken'];

export function exportDraft(draft, version) {
    const settings = {};
    for (const key of Object.keys(DEFAULTS)) if (!LOCAL_ONLY.includes(key) && draft[key] !== undefined) settings[key] = draft[key];
    return { app: 'buttercup-revival', version, exportedAt: new Date().toISOString(), settings };
}

export function importDraft(data) {
    const patch = {}, settings = data?.app === 'buttercup-revival' && data.settings;
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
        for (const [key, fallback] of Object.entries(DEFAULTS)) {
            const raw = settings[key];
            if (LOCAL_ONLY.includes(key) || typeof raw !== (typeof fallback === 'boolean' ? 'boolean' : 'string')
                || typeof raw === 'string' && raw.length > 32768) continue;
            patch[key] = raw;
        }
    }
    if (!Object.keys(patch).length) throw new Error('This is not a Buttercup settings file.');
    return patch;
}

export async function popupSettings() {
    await writes;
    return storedSettings();
}

export function persistDraft(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings draft');
    const changes = {};
    for (const [key, raw] of Object.entries(patch)) {
        if (!Object.hasOwn(DEFAULTS, key) || typeof raw !== (typeof DEFAULTS[key] === 'boolean' ? 'boolean' : 'string')
            || typeof raw === 'string' && raw.length > 32768) throw new Error('Invalid settings draft');
        changes[DRAFT_PREFIX + key] = raw;
    }
    // Start the browser storage operation synchronously, before messaging a worker.
    // Separate keys prevent an older form from replacing another field's choice.
    return chrome.storage.local.set(changes);
}

async function applyStoredDraft(strict = false) {
    const { settings: current, draft } = await storedSettings();
    let settings;
    try { settings = draftSettings(draft); }
    catch (cause) {
        if (strict) throw cause;
        return { saved: false, error: redact(cause.message, current) };
    }
    // Never replace the draft here: a newer edit may already be in storage.
    if (JSON.stringify(settings) !== JSON.stringify(current)) await chrome.storage.local.set({ settings });
    return { saved: true, settings };
}

export function applyDraft() {
    return enqueue(() => applyStoredDraft());
}

export function commitDraft() {
    return enqueue(async () => (await applyStoredDraft(true)).settings);
}

export function saveDraft(input) {
    return enqueue(async () => {
        await persistDraft(input);
        return applyStoredDraft();
    });
}

export function saveSettings(input) {
    return enqueue(async () => {
        const settings = validateSettings(input);
        const draft = formDraft(settings);
        const fields = Object.fromEntries(Object.entries(draft).map(([key, value]) => [DRAFT_PREFIX + key, value]));
        await chrome.storage.local.set({ settings, settingsDraft: draft, ...fields });
        return settings;
    });
}
