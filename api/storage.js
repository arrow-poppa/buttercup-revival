// Keep Chromium's native storage behavior and content-script access restrictions.
export const settingsStorage = {
    get: keys => chrome.storage.local.get(keys),
    set: values => chrome.storage.local.set(values),
};
export function protectSettings() {
    return Promise.all([
        chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
        chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    ]);
}
