// Firefox has no storage.local.setAccessLevel. Keep credentials in the
// extension origin's IndexedDB, which YouTube content scripts cannot access.
// Only a nonsecret revision notification goes through public browser storage.
let opening;
function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('buttercup-settings', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('settings');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { opening = undefined; reject(request.error); };
    });
    return opening;
}
export const settingsStorage = {
    async get(keys) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('settings', 'readonly');
            const store = transaction.objectStore('settings'), result = {};
            for (const key of typeof keys === 'string' ? [keys] : keys) {
                const request = store.get(key);
                request.onsuccess = () => { if (request.result !== undefined) result[key] = request.result; };
            }
            transaction.oncomplete = () => resolve(result);
            transaction.onabort = () => reject(transaction.error);
            transaction.onerror = () => reject(transaction.error);
        });
    },
    async set(values) {
        const db = await database();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('settings', 'readwrite');
            const store = transaction.objectStore('settings');
            for (const [key, value] of Object.entries(values)) store.put(value, key);
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error);
            transaction.onerror = () => reject(transaction.error);
        });
        if (Object.keys(values).some(key => key.startsWith('draftSetting:'))) {
            await chrome.storage.local.set({ 'draftSetting:revision': crypto.randomUUID() });
        }
    },
};
export function protectSettings() { return Promise.resolve(); }
