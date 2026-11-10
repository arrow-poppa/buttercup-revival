export const missingReceiver = error => /Receiving end does not exist|Could not establish connection/i.test(String(error?.message || error));
export const OFFSCREEN_PROTOCOL = 1;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function connections(api = chrome) {
    let starting;
    const attaching = new Map();
    const version = api.runtime.getManifest().version;

    function offscreen() {
        if (!starting) starting = (async () => {
            if (!await api.offscreen.hasDocument()) await api.offscreen.createDocument({
                url: 'background/offscreen.html', reasons: ['BLOBS'],
                justification: 'Process audio blobs and subtitle exports across long transcription requests.',
            });
            // A document may exist while its module imports are still loading.
            // Only readiness probes are retried, never transcription commands.
            const deadline = Date.now() + 5000;
            do {
                let reply;
                try { reply = await api.runtime.sendMessage({ target: 'offscreen', type: 'BUTTERCUP_READY' }); }
                catch (error) { if (!missingReceiver(error)) throw error; }
                if (reply?.ready && reply.protocol === OFFSCREEN_PROTOCOL) return;
                if (reply?.ready || reply?.ok === false) throw new Error('O processamento de áudio precisa ser atualizado. Recarregue a extensão; suas configurações estão salvas.');
                await pause(50);
            } while (Date.now() < deadline);
            throw new Error('O processamento de áudio não iniciou. Recarregue a extensão e tente novamente.');
        })().finally(() => { starting = null; });
        return starting;
    }

    async function sendOffscreen(message) {
        await offscreen();
        try { return await api.runtime.sendMessage({ ...message, target: 'offscreen' }); }
        catch (error) {
            if (missingReceiver(error)) throw new Error('A conexão com o processamento de áudio foi encerrada. Tente a ação novamente.');
            throw error;
        }
    }

    function content(tabId, videoId, reloadLegacy = true) {
        if (!attaching.has(tabId)) attaching.set(tabId, (async () => {
            const tab = await api.tabs.get(tabId);
            if (new URL(tab.url).origin !== 'https://www.youtube.com') throw new Error('Abra um vídeo do YouTube primeiro.');
            const probe = () => api.tabs.sendMessage(tabId, { type: 'BUTTERCUP_READY' }, { frameId: 0 }).catch(() => null);
            let reply = await probe();
            if (!reply?.ready || reply.version !== version) {
                const legacy = await api.scripting.executeScript({ target: { tabId }, func: () => {
                    const button = document.getElementById('buttercup-button');
                    return !!button && button.dataset.buttercupConnection !== '1';
                } });
                if (legacy?.[0]?.result) {
                    if (!reloadLegacy) return { legacy: true };
                    // Pre-0.2.2 scripts cannot dispose their orphaned timers and
                    // click handlers. A one-time page reload removes that context.
                    await api.tabs.reload(tabId);
                    const deadline = Date.now() + 15000;
                    do {
                        await pause(100);
                        reply = await probe();
                        if (reply?.ready && reply.version === version) break;
                    } while (Date.now() < deadline);
                } else {
                    await api.scripting.executeScript({ target: { tabId }, files: ['buttercup.js', 'content.js'] });
                    reply = await probe();
                }
            }
            if (!reply?.ready || reply.version !== version) throw new Error('Não foi possível conectar o player. Recarregue a página do YouTube.');
            return reply;
        })().finally(() => attaching.delete(tabId)));
        return attaching.get(tabId).then(reply => {
            if (reply.legacy) return reloadLegacy ? content(tabId, videoId) : reply;
            if (videoId && reply.videoId !== videoId) throw new Error('O vídeo mudou. Inicie as legendas no vídeo atual.');
            return reply;
        });
    }

    async function deliver(tabId, message) {
        await content(tabId, message.videoId);
        try { return await api.tabs.sendMessage(tabId, message, { frameId: 0 }); }
        catch (error) {
            if (!missingReceiver(error)) throw error;
            // Subtitle delivery is idempotent and never invokes the provider.
            await content(tabId, message.videoId);
            return api.tabs.sendMessage(tabId, message, { frameId: 0 });
        }
    }
    return { offscreen, sendOffscreen, content, deliver };
}
