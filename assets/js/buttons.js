import { DEFAULTS, DEEPINFRA_DEFAULT_MODEL, GROQ_DEFAULT_MODEL, validateTranscription, providerRouting, providerBaseUrl } from '../../api/config.js';
import { draftSettings, popupSettings, persistDraft, exportDraft, importDraft } from '../../api/settings.js';
import { request, saveDraftWithWorker } from '../../api/messaging.js';
import { setLanguage, tr, localize, watch, storedLanguage } from '../../api/i18n.js';
// The last language used gives an immediate first paint; storage has the final word.
let uiLanguage = 'auto';
try { uiLanguage = localStorage.getItem('buttercup-language') || 'auto'; } catch {}
function useLanguage(value) {
    try { localStorage.setItem('buttercup-language', value); } catch { return; }
    location.reload();
}
document.documentElement.lang = setLanguage(uiLanguage);
localize(document.body); watch(document.body);
storedLanguage().then(value => { if (value !== uiLanguage) useLanguage(value); }).catch(() => {});
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
function updateProviderDetails() {
    const whole = document.querySelector('[data-setting="audioMode"]').value === 'whole';
    $('whole-audio-hint').hidden = !whole;
    $('chunk-options').hidden = whole;
    const provider = document.querySelector('[data-setting="provider"]').value;
    const openrouter = provider === 'openrouter', deepinfra = provider === 'deepinfra', groq = provider === 'groq';
    const direct = deepinfra || groq;
    const chat = !direct && document.querySelector(`[data-setting="${openrouter ? 'openrouterMode' : 'customMode'}"]`).value === 'chat';
    $('openrouter-settings').hidden = !openrouter;
    $('custom-settings').hidden = provider !== 'custom';
    $('deepinfra-settings').hidden = !deepinfra;
    $('groq-settings').hidden = !groq;
    for (const id of ['shared-key', 'shared-model', 'extra-headers-setting', 'translation-support']) $(id).hidden = direct;
    $('shared-base').hidden = provider !== 'custom';
    document.querySelector('[data-setting="baseUrl"]').required = provider === 'custom';
    document.querySelector('[data-setting="baseUrl"]').disabled = provider !== 'custom';
    $('shared-key-label').textContent = openrouter ? 'OpenRouter API key' : 'Custom API key';
    document.querySelector('[data-setting="model"]').required = !direct;
    document.querySelector('[data-setting="translate"]').disabled = direct;
    $('openrouter-chat-settings').hidden = !openrouter || !chat;
    $('custom-chat-hint').hidden = !chat;
    $('openrouter-routing').hidden = !openrouter || chat;
    $('transcription-format').hidden = chat || direct;
    $('models').textContent = groq ? 'Fetch Groq speech models' : deepinfra ? 'Fetch DeepInfra speech models' : openrouter && chat ? 'Fetch audio-input chat models' : 'Fetch available models';
    let openrouterHost = openrouter;
    try { openrouterHost ||= provider === 'custom' && new URL(document.querySelector('[data-setting="baseUrl"]').value).hostname === 'openrouter.ai'; } catch {}
    $('openrouter-safety').hidden = !openrouterHost;
    $('strict-routing-status').textContent = '';
    if (openrouterHost && document.querySelector('[data-setting="openrouterNoFallback"]').checked) {
        try {
            const { pin, model } = validateTranscription(readDraft());
            $('strict-routing-status').textContent = `Strict routing: ${pin} only · ${model}. Unavailable provider = error, never fallback.`;
        } catch (error) { $('strict-routing-status').textContent = error.message; }
    }
    $('model-route-hint').hidden = !(chat && openrouterHost && /^openai\/whisper(?:-|$)/i.test(document.querySelector('[data-setting="model"]').value.trim()));
    $('use-openrouter-transcriptions').hidden = $('model-route-hint').hidden;
}
let settings, tabId, videoId, cookies, lastProgress, initialized = false, editRevision = 0, lastDraft;
async function rpc(message) {
    try { return await request(message); }
    catch (error) { if (error.code === 'BUTTERCUP_UPDATE_REQUIRED') showUpdate(); throw error; }
}
function showUpdate() {
    $('update-extension').hidden = false;
    $('update-message').hidden = false;
}
async function activateDraft() {
    try { return await saveDraftWithWorker(rpc); }
    catch (error) { if (error.code === 'BUTTERCUP_UPDATE_REQUIRED') showUpdate(); throw error; }
}
function readDraft() {
    const value = {};
    for (const input of document.querySelectorAll('[data-setting]')) {
        const key = input.dataset.setting;
        value[key] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return value;
}
function readForm({ discovery = false } = {}) {
    const value = readDraft();
    if (discovery && !value.model) value.model = DEFAULTS.model; // Discovery itself does not use a model.
    if (discovery && !value.deepinfraModel) value.deepinfraModel = DEEPINFRA_DEFAULT_MODEL;
    if (discovery && !value.groqModel) value.groqModel = GROQ_DEFAULT_MODEL;
    return draftSettings(value);
}
function persistChanges() {
    if (!initialized) throw new Error('Wait for saved settings to finish loading.');
    const draft = readDraft();
    const patch = Object.fromEntries(Object.entries(draft).filter(([key, value]) => value !== lastDraft[key]));
    if (!Object.keys(patch).length) return null;
    const previous = lastDraft;
    lastDraft = draft;
    return persistDraft(patch).catch(error => {
        if (lastDraft === draft) lastDraft = previous;
        throw error;
    });
}
function autosave(event) {
    const key = event.target.dataset.setting;
    if (!initialized || !key) return;
    if (key === 'provider' && event.target.value === 'openrouter') {
        document.querySelector('[data-setting="baseUrl"]').value = DEFAULTS.baseUrl;
        document.querySelector('[data-setting="translate"]').checked = false;
    }
    if (key === 'provider' && ['deepinfra', 'groq'].includes(event.target.value)) document.querySelector('[data-setting="translate"]').checked = false;
    if (key === 'openrouterMode' && event.target.value === 'transcriptions') document.querySelector('[data-setting="openrouterProvider"]').value = '';
    if (key === 'openrouterMode' || key === 'customMode') $('model-list').replaceChildren();
    updateProviderDetails();
    let pending;
    try { pending = persistChanges(); }
    catch (error) { $('settings-status').textContent = `Could not save changes: ${error.message}`; return; }
    if (!pending) return;
    if (key === 'uiLanguage') { pending.then(() => useLanguage(event.target.value)).catch(() => {}); return; }
    const revision = ++editRevision;
    $('settings-status').textContent = 'Saving changes…';
    // The durable edit does not depend on the worker's message response.
    pending.then(async () => {
        if (revision === editRevision) $('settings-status').textContent = 'Changes saved on this device.';
        try { await activateDraft(); return { saved: true }; }
        catch (error) { return { saved: false, error: error.message }; }
    }).then(result => {
        if (revision !== editRevision) return;
        $('settings-status').textContent = result.saved ? 'Settings saved automatically.' : `Draft saved. ${result.error}`;
    }).catch(error => {
        if (revision === editRevision) $('settings-status').textContent = `Could not save changes: ${error.message}`;
    });
}
async function requestOrigins(value) {
    const origins = new Set();
    for (const url of [providerBaseUrl(value), value.communityUrl]) {
        if (url && new URL(url).protocol === 'https:' && new URL(url).hostname !== 'openrouter.ai') origins.add(new URL(url).origin + '/*');
    }
    // Called directly from a trusted popup click: Chrome requests only selected API origins.
    if (origins.size && !await chrome.permissions.request({ origins: [...origins] })) throw new Error('Allow access to the selected API host to use it. Your settings are saved.');
}
async function save() {
    const pending = persistChanges();
    if (pending) await pending;
    const revision = editRevision;
    const value = readForm();
    await requestOrigins(value);
    // Apply the latest stored draft after any permission dialog. An older form
    // snapshot must not reset a more recent route/provider selection.
    settings = await activateDraft();
    if (revision === editRevision) {
        restoreForm(await popupSettings());
        ++editRevision;
        $('settings-status').textContent = 'Settings saved.';
    }
    return settings;
}
function action(id, callback) {
    $(id).addEventListener('click', async () => {
        $(id).disabled = true;
        try { await callback(); } catch (error) { status(error.message); }
        finally { $(id).disabled = false; }
    });
}
function showBackend(value) {
    const labels = { checking: "Checking…", starting: "Starting…", online: "Connected", offline: "Disconnected", pair: "Connect", dependencies: "Incomplete installation" };
    $('assistant-card').dataset.state = value.state;
    $('assistant-badge').textContent = labels[value.state] || "Disconnected";
    $('assistant-message').textContent = value.message;
    $('start-backend').textContent = value.state === 'online' ? "Reconnect" : "Start and connect";
    if (value.health) $('health-status').textContent = JSON.stringify(value.health, null, 2);
}
let backendCheck;
async function checkBackend() {
    if (backendCheck) return backendCheck;
    backendCheck = rpc({ type: 'BACKEND_STATUS' }).then(value => { showBackend(value); return value; })
        .catch(error => { const value = { state: 'offline', message: error.message }; showBackend(value); return value; })
        .finally(() => { backendCheck = undefined; });
    return backendCheck;
}
async function cookieStatus() {
    cookies = await rpc({ type: 'COOKIE_STATUS' });
    $('cookie-status').textContent = cookies.imported ? `Imported ${cookies.imported_at} · ${cookies.enabled ? 'enabled' : 'disabled'} · ${cookies.persistent ? 'persistent' : 'session only'}${cookies.possibly_expired ? ' · possibly expired / invalid' : ''}` : 'No cookies imported.';
}
async function tracks() {
    if (!videoId) return;
    const items = await rpc({ type: 'TRACKS', videoId });
    const previous = $('track').value;
    $('track').replaceChildren(new Option('Current transcription', ''));
    for (const item of items) $('track').add(new Option(`${item.language} → ${item.target} · ${item.model}${item.transport === 'chat-completions' ? ' · chat' : ''}${item.upstreamProvider ? ' · ' + item.upstreamProvider : ''}${item.audioTrack === 'original' ? ' · original audio' : ''}`, item.key));
    if (items.some(item => item.key === previous)) $('track').value = previous;
}
async function poll() {
    if (!tabId) return;
    const value = await rpc({ type: 'STATUS', tabId });
    const signature = JSON.stringify(value);
    if (signature === lastProgress) return;
    lastProgress = signature;
    if (value.stage !== 'idle') status(value.parts ? value.parts.map(tr).join(' ') : value.message || value.stage);
    if (value.stage === 'ready') await tracks();
}
async function initialize() {
    $('settings-fields').disabled = true;
    $('settings-status').textContent = 'Loading saved settings…';
    let stored, timeout;
    try {
        try {
            stored = await Promise.race([
                rpc({ type: 'POPUP_SETTINGS' }),
                new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Background did not respond')), 5000); }),
            ]);
        } catch {
            // A stopped or outdated worker must not lock the settings editor.
            stored = await popupSettings();
            status('Background unavailable. Reload Buttercup on the browser extensions page to use its actions.');
        } finally { clearTimeout(timeout); }
        restoreForm(stored);
        void checkBackend();
        $('reload-settings').hidden = true;
    } catch (error) {
        $('settings-status').textContent = `Could not load saved settings: ${error.message}`;
        $('reload-settings').hidden = false;
        throw error;
    } finally {
        // Always release the editor, including validation and worker failures.
        $('settings-fields').disabled = false;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    try { const url = new URL(tab.url); videoId = url.searchParams.get('v') || url.pathname.split('/')[2]; } catch {}
    await tracks(); await poll();
    setInterval(() => poll().catch(() => {}), 2000);
    setInterval(() => { if (!$('start-backend').disabled) void checkBackend(); }, 10000);
}
function restoreForm(stored) {
    settings = stored.settings;
    for (const input of document.querySelectorAll('[data-setting]')) {
        const key = input.dataset.setting;
        if (input.type === 'checkbox') input.checked = stored.draft[key];
        else input.value = stored.draft[key];
    }
    updateProviderDetails();
    lastDraft = readDraft();
    initialized = true;
    $('extension-id').textContent = chrome.runtime.id;
    $('assistant-extension-id').textContent = chrome.runtime.id;
    if (chrome.runtime.getManifest().version !== document.documentElement.dataset.buildVersion) showUpdate();
    $('settings-status').textContent = 'Changes are saved automatically, including unfinished fields.';
    try { readForm(); }
    catch (error) { $('settings-status').textContent = `Draft restored. ${error.message}`; }
}
$('settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { await save(); status('Settings saved.'); } catch (error) { status(error.message); }
});
action('generate', async () => { await save(); await rpc({ type: 'GENERATE', tabId }); status('Starting…'); });
action('reload-settings', initialize);

action('use-openrouter-transcriptions', async () => {
    // An explicit user action accepts automatic routing. Never change endpoints
    // or remove a strict provider requirement in response to an API error.
    const current = readDraft();
    const { model } = providerRouting({ ...current, openrouterNoFallback: true, openrouterProvider: '', customProvider: '' });
    document.querySelector('[data-setting="model"]').value = model;
    document.querySelector('[data-setting="openrouterNoFallback"]').checked = false;
    document.querySelector(`[data-setting="${current.provider === 'openrouter' ? 'openrouterMode' : 'customMode'}"]`).value = 'transcriptions';
    document.querySelector(`[data-setting="${current.provider === 'openrouter' ? 'openrouterProvider' : 'customProvider'}"]`).value = '';
    document.querySelector('[data-setting="responseFormat"]').value = 'verbose_json';
    updateProviderDetails();
    await save();
    status('OpenRouter Audio Transcriptions selected. Provider routing is automatic. No transcription was started.');
});
action('update-extension', async () => {
    if (initialized) { const pending = persistChanges(); if (pending) await pending; }
    chrome.runtime.reload();
});
action('cancel', async () => { await rpc({ type: 'CANCEL', tabId }); status('Cancelling…'); });
for (const format of ['srt', 'vtt']) action(format, async () => {
    const saved = await rpc({ type: 'EXPORT', tabId, key: $('track').value, format });
    status(saved?.path ? `Saved: ${saved.path}` : `${format.toUpperCase()} download requested.`);
});
action('send', async () => { await rpc({ type: 'ASB_SEND', tabId, key: $('track').value }); status('Subtitles sent to asbplayer.'); });
action('start-backend', async () => {
    const pending = persistChanges();
    if (pending) await pending;
    // Finish an older check first so a late "offline" result cannot overwrite
    // the successful startup. Pairing changes only the two local fields.
    if (backendCheck) await backendCheck;
    showBackend({ state: 'starting', message: "Opening the assistant and connecting automatically. Wait a few seconds…" });
    try {
        const value = await rpc({ type: 'START_BACKEND' });
        const stored = await popupSettings();
        for (const key of ['backendUrl', 'backendToken']) {
            document.querySelector(`[data-setting="${key}"]`).value = stored.draft[key];
            lastDraft[key] = stored.draft[key];
        }
        try { readForm(); $('settings-status').textContent = "Connection saved. Your settings were kept."; }
        catch (error) { $('settings-status').textContent = `Connection saved. ${error.message}`; }
        showBackend(value);
        if (value.state === 'online') {
            $('assistant-help').open = false;
            status("Assistant connected. Choose your provider and generate the subtitles.");
        } else $('assistant-help').open = true;
    } catch (error) {
        showBackend({ state: 'offline', message: error.message });
        $('assistant-help').open = true;
    }
});
action('check-backend', checkBackend);
action('copy-extension-id', async () => {
    await navigator.clipboard.writeText(chrome.runtime.id);
    status("ID copied. Paste it into the assistant installer.");
});
action('health', async () => {
    const pending = persistChanges();
    if (pending) await pending;
    const value = await checkBackend();
    status(value.state === 'online' ? "Local assistant connected." : value.message);
    if (value.state === 'online') await cookieStatus().catch(() => {});
});
action('models', async () => {
    const draft = readForm({ discovery: true });
    await requestOrigins(draft);
    const models = await rpc({ type: 'MODELS', settings: draft });
    $(draft.provider === 'groq' ? 'groq-model-list' : draft.provider === 'deepinfra' ? 'deepinfra-model-list' : 'model-list').replaceChildren(...models.map(id => new Option(id, id)));
    status(`${models.length} model suggestions found. You can also type any model ID.`);
});
action('provider-test', async () => {
    const file = $('sample').files[0];
    if (!file || file.size > 2000000) throw new Error('Choose a spoken audio sample up to 2 MB.');
    await save(); const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    status('Testing the transcription endpoint…');
    const result = await rpc({ type: 'PROVIDER_TEST', audio: btoa(binary), mime: file.type });
    status(`Compatible: ${result.segments} cues, ${result.words} timed words.${result.warnings?.length ? ' ' + result.warnings.join(' ') : ''}`);
});
action('import-cookies', async () => {
    const file = $('cookies').files[0];
    if (!file || file.size > 1048576) throw new Error('Choose a Netscape cookies.txt file up to 1 MiB.');
    await save(); await rpc({ type: 'COOKIE_IMPORT', content: await file.text(), persist: $('persist-cookies').checked });
    $('cookies').value = ''; await cookieStatus(); status('Cookies imported into the local backend.');
});
action('remove-cookies', async () => { await rpc({ type: 'COOKIE_DELETE' }); await cookieStatus(); status('Cookies removed.'); });
action('toggle-cookies', async () => { await cookieStatus(); await rpc({ type: 'COOKIE_TOGGLE', enabled: !cookies.enabled }); await cookieStatus(); });
action('clear-cache', async () => { await rpc({ type: 'CACHE_CLEAR' }); await tracks(); status('Local subtitle cache cleared.'); });
action('export-settings', async () => {
    const pending = persistChanges();
    if (pending) await pending;
    const data = exportDraft(readDraft(), chrome.runtime.getManifest().version), link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    link.download = `buttercup-settings-${data.exportedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    status('Settings exported.');
});
action('import-settings', async () => {
    const file = $('settings-file').files[0];
    if (!file || file.size > 1048576) throw new Error('Choose a Buttercup settings file.');
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { throw new Error('This is not a Buttercup settings file.'); }
    const patch = importDraft(data);
    await persistDraft(patch);
    $('settings-file').value = '';
    restoreForm(await popupSettings());
    ++editRevision;
    // Unfinished fields stay as a draft, exactly as when they are typed.
    await activateDraft().catch(() => {});
    if (patch.uiLanguage && patch.uiLanguage !== uiLanguage) { useLanguage(patch.uiLanguage); return; }
    status('Settings imported.');
});
action('asb-status', async () => { await save(); $('asb-result').textContent = JSON.stringify(await rpc({ type: 'ASB_STATUS' }), null, 2); status('asbplayer server reachable.'); });
$('settings-form').addEventListener('input', autosave);
$('settings-form').addEventListener('change', autosave);
document.querySelector('[data-setting="uiLanguage"]').addEventListener('change', autosave);
initialize().catch(error => status(error.message));
