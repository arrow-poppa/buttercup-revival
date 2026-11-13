import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');

test('one build produces a preserved Chromium manifest and a private persistent Gecko target', async () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
    const source = await read('manifest.json'), chromium = await read('dist/extension/manifest.json');
    assert.equal(chromium, source);
    assert.equal(await read('dist/extension/api/storage.js'), await read('api/storage.js'));
    assert.equal(await read('dist/extension/popup.html'), await read('popup.html'));
    const firefox = JSON.parse(await read('dist/firefox/manifest.json'));
    const identity = JSON.parse(await read('gecko/manifest.json')).browser_specific_settings;
    assert.deepEqual(firefox.browser_specific_settings, identity);
    assert.deepEqual(firefox.background, { page: 'gecko/background.html', persistent: true });
    assert.equal(firefox.manifest_version, 2);
    for (const key of ['key', 'minimum_chrome_version', 'host_permissions', 'action']) assert.equal(firefox[key], undefined);
    assert.ok(!firefox.permissions.includes('offscreen'));
    assert.ok(firefox.permissions.includes('nativeMessaging'));
    assert.equal(await read('dist/firefox/api/storage.js'), await read('gecko/storage.js'));
    assert.match(await read('dist/firefox/popup.html'), /compat\.js[\s\S]*type="module"/);
    assert.equal(firefox.content_scripts[0].js[0], 'gecko/compat.js');
});
