// Browser-managed commands work with the popup closed and survive UI updates.
export function shortcutHandler({ api, ready, generate, reportError }) {
    return async (command, suppliedTab) => {
        if (!['generate-subtitles', 'regenerate-subtitles'].includes(command)) return;
        let tab = suppliedTab;
        try {
            await ready;
            tab ||= (await api.tabs.query({ active: true, currentWindow: true }))[0];
            if (!tab?.id) return;
            // Query the current URL; the command event's snapshot may be stale.
            const current = await api.tabs.get(tab.id);
            if (!current.url || new URL(current.url).origin !== 'https://www.youtube.com') return;
            return await generate(tab.id, command === 'regenerate-subtitles');
        } catch (error) {
            if (tab?.id) await reportError(tab.id, error);
        }
    };
}
