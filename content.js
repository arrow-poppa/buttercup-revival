(() => {
    globalThis.__buttercupContent?.dispose();
    document.getElementById('buttercup-button')?.remove();
    document.getElementById('buttercup-notice')?.remove();
    const events = new AbortController();
    let disposed = false, interval;
    const renderer = new ButtercupRenderer();
    let settings = { enabled: true, preferHuman: true, showOnPlayer: true }, videoId = '', button, lastStatus, activity = null, strings = {};
    const say = text => strings[text] || text;
    const request = async message => {
        let result;
        try { result = await chrome.runtime.sendMessage(message); }
        catch (error) {
            if (/Extension context invalidated|Receiving end does not exist|Could not establish connection/i.test(error.message)) {
                throw new Error(say("The extension was updated. Open the Buttercup popup to reconnect the player."));
            }
            throw error;
        }
        if (!result?.ok) throw new Error(result?.error || say('Buttercup unavailable'));
        return result.data;
    };
    function currentId() {
        const url = new URL(location.href);
        const candidate = url.searchParams.get('v') || (/^\/(shorts|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : '');
        return /^[A-Za-z0-9_-]{11}$/.test(candidate || '') ? candidate : '';
    }
    function notify(text, keep = false) {
        lastStatus = text;
        if (button) { button.title = `Buttercup: ${text}`; button.setAttribute('aria-label', button.title); }
        let notice = document.getElementById('buttercup-notice');
        if (!notice) {
            notice = document.createElement('div'); notice.id = 'buttercup-notice'; notice.setAttribute('role', 'status');
            Object.assign(notice.style, { position: 'fixed', bottom: '80px', right: '24px', maxWidth: '420px', padding: '12px 18px',
                borderRadius: '12px', background: '#301e35', color: '#fff', zIndex: '2147483647', font: '14px system-ui' });
            document.body.append(notice);
        }
        notice.textContent = `Buttercup · ${text}`;
        clearTimeout(notify.timer);
        if (!keep) notify.timer = setTimeout(() => notice.remove(), 7000);
    }
    // The notice stays for the whole job, with a percentage when the stage has
    // one and the elapsed time, so one long request never looks stalled.
    function progress(status) {
        const finished = ['ready', 'error', 'cancelled', 'idle'].includes(status.stage);
        let text = status.message || status.stage;
        const fraction = status.total_bytes ? status.downloaded_bytes / status.total_bytes : status.progress;
        if (!finished && fraction > 0 && fraction <= 1) text += ` ${Math.round(fraction * 100)}%`;
        activity = finished ? null : { text, since: activity?.since || Date.now() };
        if (finished) notify(text); else tick();
    }
    function tick() {
        if (!activity) return;
        const seconds = Math.floor((Date.now() - activity.since) / 1000);
        notify(`${activity.text} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, true);
    }
    async function generate() {
        try { await request({ type: 'GENERATE' }); if (!activity) progress({ stage: 'starting', message: say('Starting…') }); }
        catch (error) { activity = null; notify(error.message); }
    }
    async function navigation() {
        const next = currentId();
        if (next === videoId) return;
        if (videoId) await request({ type: 'CANCEL' }).catch(() => {});
        renderer.clear(); videoId = next;
        if (activity) { activity = null; clearTimeout(notify.timer); document.getElementById('buttercup-notice')?.remove(); }
        if (button) button.setAttribute('aria-pressed', 'false');
    }
    function attach() {
        if (disposed) return;
        if (!chrome.runtime.id) { dispose(); return; }
        navigation();
        const controls = document.querySelector('#movie_player .ytp-right-controls');
        if (!controls || !videoId || !settings.enabled) { button?.remove(); button = null; return; }
        if (button?.parentElement !== controls) {
            button?.remove(); button = document.createElement('button');
            button.className = 'ytp-button'; button.id = 'buttercup-button'; button.textContent = 'BC';
            button.dataset.buttercupConnection = '1';
            // YouTube's own controls hold an icon; centre the label the same way.
            Object.assign(button.style, { font: 'bold 14px system-ui', color: '#ffb1c2', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', verticalAlign: 'top', lineHeight: '1', padding: '0' });
            button.title = `Buttercup: ${lastStatus || say('Generate better captions')}`;
            button.setAttribute('aria-label', button.title); button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', async event => {
                if (!event.isTrusted) return;
                if (renderer.segments.length) {
                    const showing = renderer.toggle(); button.setAttribute('aria-pressed', String(showing));
                    // Do not restore/reload YouTube's caption source when only
                    // hiding Buttercup: other subtitle tools may follow it.
                    if (showing) await request({ type: 'HIDE_YOUTUBE_CAPTIONS' }).catch(() => {});
                } else generate();
            });
            controls.prepend(button);
        }
        const video = document.querySelector('#movie_player video');
        if (renderer.segments.length && video && video !== renderer.video) {
            const segments = renderer.segments, showing = renderer.track?.mode === 'showing';
            renderer.show(video, segments);
            if (!showing) renderer.toggle();
        }
    }
    function onMessage(message, sender, respond) {
        if (sender.id !== chrome.runtime.id) return;
        if (message.type === 'BUTTERCUP_READY') {
            respond({ ready: true, version: chrome.runtime.getManifest().version, videoId: currentId() });
            return false;
        }
        if (message.type === 'PROGRESS') progress(message.status);
        if (message.type === 'SETTINGS') {
            const shown = settings.showOnPlayer !== false, show = message.settings.showOnPlayer !== false;
            settings = message.settings; strings = settings.strings || {};
            if (settings.enabled && shown !== show && renderer.segments.length && (renderer.track?.mode === 'showing') !== show) {
                renderer.toggle(); button?.setAttribute('aria-pressed', String(show));
                if (show) request({ type: 'HIDE_YOUTUBE_CAPTIONS' }).catch(() => {});
            }
            if (!settings.enabled) { renderer.clear(); request({ type: 'CANCEL' }).catch(() => {}); request({ type: 'RESTORE' }).catch(() => {}); }
            attach();
        }
        if (message.type === 'SUBTITLES' && message.videoId === currentId()) {
            const video = document.querySelector('#movie_player video');
            const visible = message.visible !== false;
            if (video) { renderer.show(video, message.segments, message.language, visible); button?.setAttribute('aria-pressed', String(visible)); }
            respond({ received: !!video });
            return false;
        }
    }
    function dispose() {
        disposed = true;
        events.abort();
        clearInterval(interval); clearTimeout(notify.timer);
        renderer.clear(); button?.remove();
        document.getElementById('buttercup-notice')?.remove();
        try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    }
    globalThis.__buttercupContent = { dispose };
    chrome.runtime.onMessage.addListener(onMessage);
    request({ type: 'PUBLIC_SETTINGS' }).then(value => { settings = value; strings = value.strings || {}; attach(); }).catch(() => {});
    // A reloaded page picks up the job that is still running for this tab.
    request({ type: 'STATUS' }).then(status => { if (!activity && !['ready', 'error', 'cancelled', 'idle'].includes(status.stage)) progress(status); }).catch(() => {});
    document.addEventListener('yt-navigate-finish', attach, { signal: events.signal });
    interval = setInterval(() => { attach(); tick(); }, 1000);
})();
