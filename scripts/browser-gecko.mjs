// Real Gecko runtime + Python native bridge. YouTube/audio/provider/asbplayer
// traffic is synthetic; this test never uses accounts, cookies or paid APIs.
// Linux test runner; BUTTERCUP_GECKO_BROWSER can point to Firefox, Zen or a fork.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'linux') throw new Error('This runtime harness currently supports native Linux browsers.');
const work = await mkdtemp(path.join(os.tmpdir(), 'buttercup-gecko-test-'));
const profile = path.join(work, 'profile'), extension = path.join(work, 'extension');
const state = path.join(work, 'state', 'buttercup-revival');
const host = `app.buttercup.test_${process.pid}`;
const token = 'SYNTHETIC_LOCAL_TEST_TOKEN_'.repeat(2);
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (fn, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    do { const value = await fn(); if (value) return value; await pause(100); } while (Date.now() < deadline);
    throw new Error('Timed out waiting for Gecko runtime assertion');
};
const freePort = async () => {
    const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port; await new Promise(r => server.close(r)); return port;
};
let browser, ws, fixture, call, flatpakInstance, nativeStarted = false;
const registrations = [], errors = [], pending = new Map();
const counts = { extracts: 0, transcriptions: 0, sends: 0, deletes: 0 };
let providerDelay = Number(process.env.BUTTERCUP_GECKO_DELAY_MS || 65000);
let fixtureFormat = 'mp3';
const uploadedFormats = [];
try {
    await mkdir(profile); await mkdir(state, { recursive: true, mode: 0o700 });
    await cp(path.join(root, 'dist/firefox'), extension, { recursive: true });
    // Only the host name changes, to avoid touching any installed registration.
    const assistantFile = path.join(extension, 'api/assistant.js');
    await writeFile(assistantFile, (await readFile(assistantFile, 'utf8')).replace('app.buttercup.assistant', host));
    const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
    const addonId = manifest.browser_specific_settings.gecko.id;
    const nativePort = await freePort(), debugPort = await freePort();
    await writeFile(path.join(state, 'assistant.json'), JSON.stringify({
        port: nativePort, extension_ids: ['a'.repeat(32)], gecko_ids: [addonId],
        node: process.execPath, ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe',
    }), { mode: 0o600 });
    await writeFile(path.join(state, 'token.private.json'), JSON.stringify({ token }), { mode: 0o600 });
    const wrapper = path.join(work, 'native-host');
    await writeFile(wrapper, `#!/bin/sh\nexport XDG_STATE_HOME=${shellQuote(path.join(work, 'state'))}\nexec ${shellQuote(path.join(root, '.venv/bin/python'))} ${shellQuote(path.join(root, 'scripts/native_assistant.py'))} "$@"\n`, { mode: 0o700 });
    const configRoot = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const hostDirs = [path.join(os.homedir(), '.mozilla/native-messaging-hosts'), path.join(configRoot, 'mozilla/native-messaging-hosts')];
    if (process.env.BUTTERCUP_GECKO_HOST_DIR) hostDirs.push(process.env.BUTTERCUP_GECKO_HOST_DIR);
    for (const dir of new Set(hostDirs)) {
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, host + '.json');
        await writeFile(file, JSON.stringify({ name: host, description: 'Disposable Buttercup runtime test', path: wrapper, type: 'stdio', allowed_extensions: [addonId] }), { flag: 'wx', mode: 0o600 });
        registrations.push(file);
    }
    const bridgeTest = process.env.BUTTERCUP_TEST_FLATPAK_BRIDGE;
    if (bridgeTest) {
        const appRoot=path.join(os.homedir(),'.var/app',process.env.BUTTERCUP_TEST_FLATPAK);
        const bridge=path.join(appRoot,'config',host+'-bridge');
        await mkdir(path.dirname(bridge),{recursive:true});
        await writeFile(bridge,`#!/bin/sh\nexec /usr/bin/flatpak-spawn --host --watch-bus ${shellQuote(wrapper)} "$@"\n`,{mode:0o700});
        registrations.push(bridge);
        for(const dir of [path.join(appRoot,'.mozilla/native-messaging-hosts'),path.join(appRoot,'config/mozilla/native-messaging-hosts')]) {
            await mkdir(dir,{recursive:true});
            const file=path.join(dir,host+'.json');
            await writeFile(file,JSON.stringify({name:host,description:'Disposable Flatpak bridge',path:bridge,type:'stdio',allowed_extensions:[addonId]}),{flag:'wx',mode:0o600});
            registrations.push(file);
        }
    }
    await writeFile(path.join(profile, 'user.js'), [
        'user_pref("browser.shell.checkDefaultBrowser", false);',
        'user_pref("browser.download.folderList", 2);',
        `user_pref("browser.download.dir", ${JSON.stringify(work)});`,
        'user_pref("browser.download.useDownloadDir", true);',
        'user_pref("browser.aboutwelcome.enabled", false);',
        'user_pref("zen.welcome-screen.seen", true);',
    ].join('\n'));
    const flatpak = process.env.BUTTERCUP_TEST_FLATPAK;
    const binary = flatpak ? 'flatpak' : process.env.BUTTERCUP_GECKO_BROWSER || 'firefox';
    let browserLog = '';
    browser = spawn(binary, [...(flatpak ? ['run', '--instance-id-fd=3', '--filesystem=' + work, '--env=MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1', ...(bridgeTest ? ['--persist=.mozilla','--talk-name=org.freedesktop.Flatpak'] : []), flatpak] : []), ...(process.env.BUTTERCUP_TEST_SHORTCUTS ? [] : ['--headless']), '--no-remote', '--profile', profile, '--remote-debugging-port', String(debugPort), 'about:blank'], {
        env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    browser.stdio[3].on('data', data => { const match = data.toString().match(/^(\d+)\n/); if (match) flatpakInstance = match[1]; });
    browser.on('error', error => { browserLog += error.message; });
    browser.stderr.on('data', data => { browserLog += data.toString(); });
    await until(() => { if (browser.exitCode !== null) throw new Error('Gecko failed to start: ' + browserLog.slice(-1500)); return browserLog.includes('WebDriver BiDi listening'); }, 20000);
    ws = new WebSocket(`ws://127.0.0.1:${debugPort}/session`);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0;
    call = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`BiDi timed out: ${method}`)); }, 20000);
        pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params }));
    });
    const html = `<!doctype html><title>Buttercup Gecko shortcut fixture</title><div id="movie_player"><video></video><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button></div></div><script>
      const p = document.getElementById('movie_player');
      p.getPlayerResponse = () => ({videoDetails:{videoId:'abcdefghijk',title:'Gecko fixture'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{kind:'asr'}],audioTracks:[{}]}}});
      p.unloadModule = () => {}; p.loadModule = () => {};
    </script>`;
    ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const item = pending.get(message.id); if (!item) return;
            pending.delete(message.id); clearTimeout(item.timeout);
            if (message.type === 'error') item.reject(new Error(`${message.error}: ${message.message}`)); else item.resolve(message.result);
        } else if (message.method === 'network.beforeRequestSent' && message.params.isBlocked) {
            const request = message.params.request;
            const operation = request.url.startsWith('https://www.youtube.com/')
                ? call('network.provideResponse', { request: request.request, statusCode: 200, headers: [{ name: 'Content-Type', value: { type: 'string', value: 'text/html' } }], body: { type: 'string', value: html } })
                : call('network.failRequest', { request: request.request });
            operation.catch(error => errors.push(error.message));
        } else if (message.method === 'log.entryAdded' && message.params.level === 'error' && message.params.type === 'javascript') {
            errors.push(message.params.text);
        }
    };
    const session = await call('session.new', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    console.log(`Testing ${session.capabilities.browserName} ${session.capabilities.browserVersion}`);
    await call('session.subscribe', { events: ['network.beforeRequestSent', 'log.entryAdded'] });
    await call('network.addIntercept', { phases: ['beforeRequestSent'], urlPatterns: [{ type: 'pattern', protocol: 'https' }] });
    await call('webExtension.install', { extensionData: { type: 'path', path: extension } });
    const installed = (await call('webExtension.moz:listExtensions')).extensions.find(item => item.id === addonId);
    assert.ok(installed?.isActive); assert.equal(installed.manifestVersion, 2);
    const base = installed.policy.extensionURL;
    const evaluate = async (context, expression) => {
        const result = await call('script.evaluate', { expression: `(async()=>JSON.stringify(await (${expression})))()`, target: { context }, awaitPromise: true });
        if (result.type !== 'success') throw new Error(result.exceptionDetails?.text || JSON.stringify(result));
        return JSON.parse(result.result.value ?? 'null');
    };
    const open = async url => {
        const { context } = await call('browsingContext.create', { type: 'tab' });
        await call('browsingContext.navigate', { context, url, wait: 'complete' }); return context;
    };
    let popup = await open(base + (flatpak ? 'popup.html?view=connection' : 'popup.html'));
    await until(() => evaluate(popup, `!document.getElementById('settings-fields').disabled`));
    const send = message => evaluate(popup, `browser.runtime.sendMessage(${JSON.stringify(message)})`);
    const before = await evaluate(popup, `(async()=> (await browser.tabs.query({})).length)()`);
    nativeStarted = true; // Clean up even if pairing starts the service but its reply fails.
    let paired;
    if (flatpak && !bridgeTest) {
        assert.equal((await send({ type: 'START_BACKEND' })).ok, false, 'Sandboxed native startup must fail in this fixture');
        const file = path.join(work, 'connection.private.json');
        execFileSync(path.join(root, '.venv/bin/python'), [path.join(root, 'scripts/setup-assistant.py'), '--manual-origin', base.slice(0,-1), '--connection-file', file], {env:{...process.env,XDG_STATE_HOME:path.join(work,'state')}});
        const connection = await readFile(file, 'utf8');
        // BiDi input.setFiles rejects privileged extension pages in Zen. Feed
        // the generated fixture through a File; the real import handler runs.
        await evaluate(popup, `(async()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(connection)}],'connection.private.json',{type:'application/json'}));document.getElementById('connection-file').files=transfer.files;return true})()`);
        await evaluate(popup, `(document.getElementById('import-connection').click(), true)`);
        await until(()=>evaluate(popup, `document.getElementById('connection-import-status').textContent.includes('Assistant connected')`));
        paired = {ok:true};
    } else paired = await send({ type: 'START_BACKEND' });
    assert.equal(paired.ok, true, JSON.stringify(paired));
    await until(async () => (await send({ type: 'BACKEND_STATUS' })).data?.state === 'online');
    assert.equal(await evaluate(popup, `(await import('./api/config.js')).getSettings().then(s=>s.backendToken===${JSON.stringify(token)})`), true);
    assert.equal((await fetch(`http://127.0.0.1:${nativePort}/health`, { headers: { Origin: base.slice(0, -1), Authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${nativePort}/health`, { headers: { Origin: 'moz-extension://00000000-0000-0000-0000-000000000000', Authorization: `Bearer ${token}` } })).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${nativePort}/health`, { headers: { Origin: base.slice(0, -1) } })).status, 401);
    console.log(`${bridgeTest ? 'Flatpak host bridge' : flatpak ? 'Manual Flatpak' : 'Native Python'} pairing and exact-origin/token enforcement passed`);

    fixture = createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        if (req.method === 'OPTIONS') return res.end('{}');
        if (req.url === '/health') return res.end(JSON.stringify({ status: 'ok', version: '0.2.0', ffmpeg: true, ffprobe: true, js_runtime_available: true, audio_formats: ['mp3', 'flac'] }));
        if (req.url === '/cookies/status') return res.end('{"imported":false}');
        if (req.url === '/jobs/extract') { counts.extracts++; fixtureFormat = JSON.parse(body).audio_format || 'mp3'; return res.end(JSON.stringify({ id: 'fixture', state: 'ready', audio_format: fixtureFormat, chunks: [{ index: 0, offset: 0, duration: 4 }] })); }
        if (req.url === '/jobs/fixture/chunks/0') { res.setHeader('Content-Type', fixtureFormat === 'flac' ? 'audio/flac' : 'audio/mpeg'); return res.end('fixture-audio'); }
        if (req.url === '/jobs/fixture' && req.method === 'DELETE') { counts.deletes++; return res.end('{}'); }
        if (req.url === '/v1/audio/transcriptions') {
            counts.transcriptions++; assert.equal(req.headers.authorization, 'Bearer SYNTHETIC_PROVIDER_KEY');
            assert.ok(!body.includes(Buffer.from(token))); assert.ok(body.includes(Buffer.from('fixture-audio')));
            assert.ok(body.includes(Buffer.from(`filename="audio.${fixtureFormat}"`)));
            assert.ok(body.includes(Buffer.from(`Content-Type: ${fixtureFormat === 'flac' ? 'audio/flac' : 'audio/mpeg'}`)));
            uploadedFormats.push(fixtureFormat);
            await pause(providerDelay);
            return res.end(JSON.stringify({ language: 'ja', segments: [{ start: 0, end: 4, text: '日本語の字幕を確認します。' }] }));
        }
        if (req.url === '/asbplayer/load-subtitles') { counts.sends++; res.writeHead(204); return res.end(); }
        if (req.url === '/asbplayer/bound-media') return res.end('{"media":[]}');
        res.writeHead(404); res.end('{}');
    });
    await new Promise(r => fixture.listen(0, '127.0.0.1', r));
    const local = `http://127.0.0.1:${fixture.address().port}`;
    await evaluate(popup, `(async()=>{const {DEFAULTS}=await import('./api/config.js');await (await import('./api/settings.js')).saveSettings({...DEFAULTS,uiLanguage:'en',provider:'custom',baseUrl:${JSON.stringify(local + '/v1')},model:'fixture',apiKey:'SYNTHETIC_PROVIDER_KEY',backendUrl:${JSON.stringify(local)},backendToken:${JSON.stringify(token)},asbplayerUrl:${JSON.stringify(local)},mediaId:'fixture',timeoutSeconds:150});return true})()`);
    const youtube = await open('https://www.youtube.com/watch?v=abcdefghijk');
    await until(() => evaluate(youtube, `!!document.getElementById('buttercup-button')`));
    const tabId = await evaluate(popup, `(async()=> (await browser.tabs.query({url:'https://www.youtube.com/*'}))[0].id)()`);
    const isolated = await evaluate(popup, `browser.scripting.executeScript({target:{tabId:${tabId}},func:async()=>{await browser.storage.local.set({settings:{apiKey:'CONTENT_INJECTION'}});const isolated=await new Promise((resolve,reject)=>{const request=indexedDB.open('buttercup-settings',1);request.onsuccess=()=>{resolve(!request.result.objectStoreNames.contains('settings'));request.result.close()};request.onerror=()=>reject(request.error)});return {storage:await browser.storage.local.get(null),isolated,privileged:await browser.runtime.sendMessage({type:'SETTINGS'})}}}).then(r=>r[0].result)`);
    assert.ok(!JSON.stringify(isolated.storage).includes('SYNTHETIC')); assert.equal(isolated.privileged.ok, false); assert.equal(isolated.isolated, true);
    assert.equal(await evaluate(popup, `(await import('./api/config.js')).getSettings().then(s=>s.apiKey==='SYNTHETIC_PROVIDER_KEY')`), true);
    const generated = await send({ type: 'GENERATE', tabId }); assert.equal(generated.data?.data?.started, true, JSON.stringify(generated));
    await until(() => counts.transcriptions === 1);
    const after = await evaluate(popup, `(async()=> (await browser.tabs.query({})).length)()`);
    assert.equal(after, before + 1, 'Processing must not open another tab');
    await call('browsingContext.close', { context: popup });
    console.log(`Waiting ${providerDelay / 1000}s with the popup closed to verify persistent hidden processing`);
    await until(() => evaluate(youtube, `!!document.querySelector('video')?.textTracks?.length`), providerDelay + 15000);
    popup = await open(base + 'popup.html');
    await until(async () => (await send({ type: 'STATUS', tabId })).data?.stage === 'ready');
    assert.equal(counts.transcriptions, 1);
    const exports = await send({ type: 'EXPORT', tabId, format: 'srt' }); assert.equal(exports.data?.ok, true, JSON.stringify(exports));
    await until(() => evaluate(popup, `browser.downloads.search({state:'complete'}).then(r=>r.length>0)`));
    const downloads = await evaluate(popup, `browser.downloads.search({state:'complete'}).then(r=>r.map(d=>d.filename))`);
    assert.match(await readFile(downloads.at(-1), 'utf8'), /日本語/);
    const asb = await send({ type: 'ASB_SEND', tabId }); assert.equal(asb.data?.ok, true, JSON.stringify(asb)); assert.equal(counts.sends, 1);
    await send({ type: 'GENERATE', tabId });
    await until(async () => (await send({ type: 'STATUS', tabId })).data?.stage === 'ready');
    assert.equal(counts.transcriptions, 1, 'Cached subtitles must not call the provider again');
    if (process.env.BUTTERCUP_TEST_SHORTCUTS) {
        // Firefox supports custom assignments through commands.update. Exercise
        // the remapped keys through actual X11 events, not a runtime message.
        await evaluate(popup, `(async()=>{await browser.commands.update({name:'generate-subtitles',shortcut:'Alt+Shift+Y'});await browser.commands.update({name:'regenerate-subtitles',shortcut:'Ctrl+Shift+9'});return true})()`);
        await evaluate(popup, `(globalThis.shortcutEvents=[],browser.commands.onCommand.addListener(name=>globalThis.shortcutEvents.push(name)),true)`);
        await pause(200);
        const commands=await evaluate(popup, `browser.commands.getAll()`);
        assert.equal(commands.find(c=>c.name==='generate-subtitles').shortcut,'Alt+Shift+Y');
        const keys=async key=>{
            await call('browsingContext.activate',{context:youtube});
            const windows=execFileSync('xdotool',['search','--onlyvisible','--name','Buttercup Gecko shortcut fixture'],{encoding:'utf8'}).trim().split('\n');
            execFileSync('xdotool',['windowfocus','--sync',windows[0]]);
            execFileSync('xdotool',['key','--clearmodifiers',key]);
        };
        await evaluate(popup, `browser.storage.session.remove('status-${tabId}').then(()=>true)`);
        await keys('alt+shift+y');
        await until(async()=>(await send({type:'STATUS',tabId})).data?.source==='cache');
        assert.equal(counts.transcriptions,1,'Custom Generate key must reuse the cache');
        providerDelay=0;
        await evaluate(popup, `browser.storage.session.remove('status-${tabId}').then(()=>true)`);
        await keys('ctrl+shift+9');
        try { await until(async()=>counts.transcriptions===2&&(await send({type:'STATUS',tabId})).data?.stage==='ready'); } catch(error) { throw new Error(error.message+'; events='+JSON.stringify(await evaluate(popup,'globalThis.shortcutEvents'))+'; state='+JSON.stringify(await send({type:'STATUS',tabId}))); }
        assert.equal(counts.transcriptions,2,'Custom Regenerate key must request fresh subtitles');
        console.log('Physical customized Gecko shortcuts passed');
    }
    // Exercise the real format selector, persistence and fresh FLAC upload.
    await until(() => evaluate(popup, `!document.getElementById('settings-fields').disabled`));
    await evaluate(popup, `(globalThis.originalFormatSend=browser.runtime.sendMessage.bind(browser.runtime),browser.runtime.sendMessage=async(message,...args)=>{const result=await globalThis.originalFormatSend(message,...args);if(message.type==='POPUP_SETTINGS'&&result?.data?.draft){delete result.data.settings.audioFormatProfiles;delete result.data.draft.audioFormatProfiles}return result},document.getElementById('reload-settings').click(),true)`);
    await until(() => evaluate(popup, `!document.getElementById('settings-fields').disabled&&!document.getElementById('update-extension').hidden`));
    assert.equal(await evaluate(popup, `document.getElementById('audio-format').disabled`), false, 'Old background settings must not lock the Gecko picker');
    await evaluate(popup, `(browser.runtime.sendMessage=globalThis.originalFormatSend,delete globalThis.originalFormatSend,document.querySelector('[data-setting="provider"]').value='deepinfra',document.querySelector('[data-setting="provider"]').dispatchEvent(new Event('change',{bubbles:true})),true)`);
    await evaluate(popup, `(document.getElementById('audio-format').value='flac',document.getElementById('audio-format').dispatchEvent(new Event('change',{bubbles:true})),true)`);
    assert.equal(await evaluate(popup, `document.getElementById('audio-format').disabled`), false);
    assert.equal(await evaluate(popup, `document.getElementById('audio-format').value`), 'flac', 'DeepInfra must allow FLAC in Gecko');
    await evaluate(popup, `(document.querySelector('[data-setting="provider"]').value='custom',document.querySelector('[data-setting="provider"]').dispatchEvent(new Event('change',{bubbles:true})),true)`);
    await until(() => evaluate(popup, `(await import('./api/config.js')).getSettings().then(s=>s.provider==='custom')`));
    await evaluate(popup, `(document.getElementById('audio-format').value='flac',document.getElementById('audio-format').dispatchEvent(new Event('change',{bubbles:true})),true)`);
    await until(() => evaluate(popup, `(async()=>{const c=await import('./api/config.js');return c.audioFormat(await c.getSettings())==='flac'})()`));
    await evaluate(popup, `(document.querySelector('[data-setting="model"]').value='other-fixture',document.querySelector('[data-setting="model"]').dispatchEvent(new Event('input',{bubbles:true})),true)`);
    assert.equal(await evaluate(popup, `document.getElementById('audio-format').value`), 'mp3');
    await evaluate(popup, `(document.querySelector('[data-setting="model"]').value='fixture',document.querySelector('[data-setting="model"]').dispatchEvent(new Event('input',{bubbles:true})),true)`);
    assert.equal(await evaluate(popup, `document.getElementById('audio-format').value`), 'flac');
    await call('browsingContext.close', { context: popup });
    popup = await open(base + 'popup.html');
    await until(() => evaluate(popup, `!document.getElementById('settings-fields').disabled`));
    assert.equal(await evaluate(popup, `document.getElementById('audio-format').value`), 'flac');
    const beforeFlac = { ...counts };
    await evaluate(popup, `browser.storage.session.remove('status-${tabId}').then(()=>true)`);
    await send({ type: 'GENERATE', tabId });
    await until(async () => (await send({ type: 'STATUS', tabId })).data?.stage === 'ready');
    assert.deepEqual(counts, beforeFlac, 'Changing encoding must reuse cached subtitles');
    providerDelay = 0;
    await evaluate(popup, `browser.storage.session.remove('status-${tabId}').then(()=>true)`);
    await send({ type: 'GENERATE', tabId, ignoreCache: true });
    await until(async () => (await send({ type: 'STATUS', tabId })).data?.stage === 'ready');
    assert.equal(counts.transcriptions, beforeFlac.transcriptions + 1);
    assert.equal(uploadedFormats.at(-1), 'flac');
    console.log('Gecko format preferences, cache reuse and explicit FLAC regeneration passed');
    // Settings import uses the same schema and preserves the local pairing.
    await evaluate(popup, `(async()=>{const m=await import('./api/settings.js');await m.persistDraft(m.importDraft({app:'buttercup-revival',version:'0.5.0',settings:{language:'zh',maxLineLength:'6',backendToken:'IGNORED'}}));await m.commitDraft();return true})()`);
    await call('browsingContext.close', { context: popup });
    popup = await open(base + 'popup.html?view=settings');
    const saved = await evaluate(popup, `(await import('./api/config.js')).getSettings().then(s=>({language:s.language,maxLineLength:s.maxLineLength,paired:s.backendToken===${JSON.stringify(token)}}))`);
    assert.deepEqual(saved, { language: 'zh', maxLineLength: 6, paired: true });
    await evaluate(popup, `(await import('./api/settings.js')).persistDraft({cache:false}).then(()=>true)`);
    providerDelay = 2000;
    const cancellationCount=counts.transcriptions+1;
    await send({ type: 'GENERATE', tabId }); await until(() => counts.transcriptions === cancellationCount);
    await send({ type: 'CANCEL', tabId });
    await until(async () => (await send({ type: 'STATUS', tabId })).data?.stage === 'cancelled');
    assert.equal(counts.transcriptions, cancellationCount);
    await pause(providerDelay + 100);
    await evaluate(popup, `(setTimeout(()=>browser.runtime.reload(), 100), true)`);
    await pause(1000);
    popup = await open(base + 'popup.html');
    await until(() => evaluate(popup, `!document.getElementById('settings-fields').disabled`));
    const reloaded = await evaluate(popup, `(await import('./api/config.js')).getSettings().then(s=>({language:s.language,paired:s.backendToken===${JSON.stringify(token)}}))`);
    assert.deepEqual(reloaded, {language:'zh',paired:true});
    await until(() => evaluate(youtube, `!!document.getElementById('buttercup-button')`));
    assert.deepEqual(errors, []);
    console.log('PASS: shared UI, private settings, native pairing, hidden long job, subtitles, cache, SRT export, asbplayer, legacy settings, cancellation, reload');
} finally {
    if (call && ws?.readyState === WebSocket.OPEN) await call('browser.close').catch(() => {});
    ws?.close();
    if (flatpakInstance) { try { execFileSync('flatpak', ['kill', flatpakInstance], {stdio:'ignore'}); } catch {} }
    for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(new Error('Test cleanup')); }
    if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await Promise.race([new Promise(r=>browser.once('exit',r)), pause(3000)]); if(browser.exitCode===null) browser.kill('SIGKILL'); }
    browser?.stdout.destroy(); browser?.stderr.destroy(); browser?.stdio[3]?.destroy();
    if (fixture) { fixture.closeAllConnections(); await new Promise(r => fixture.close(r)); }
    if (nativeStarted) { await writeFile(path.join(state, 'stop.request'), 'stop\n'); await pause(1500); }
    for (const file of registrations) await rm(file, { force: true });
    await rm(work, { recursive: true, force: true });
}
