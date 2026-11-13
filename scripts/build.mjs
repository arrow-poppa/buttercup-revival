import { cp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'dist', 'extension');
if (path.relative(root, target) !== path.join('dist', 'extension')) throw new Error('Unsafe build path');
await mkdir(path.join(root, 'dist'), { recursive: true });
if (await realpath(path.join(root, 'dist')) !== path.join(await realpath(root), 'dist')) throw new Error('Build directory must stay inside the project');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const name of ['manifest.json', 'buttercup.js', 'content.js', 'popup.html', 'api', 'background', 'cache', 'subtitles', 'integrations', 'icons', 'locales']) {
    await cp(path.join(root, name), path.join(target, name), { recursive: true });
}
await mkdir(path.join(target, 'assets', 'css'), { recursive: true });
await mkdir(path.join(target, 'assets', 'js'), { recursive: true });
await cp(path.join(root, 'assets', 'css', 'popup.css'), path.join(target, 'assets', 'css', 'popup.css'));
await cp(path.join(root, 'assets', 'js', 'buttons.js'), path.join(target, 'assets', 'js', 'buttons.js'));
const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'));
// The Chromium target retains its original manifest and directory. Gecko gets
// only a manifest conversion and the compatibility files it actually needs.
const firefox = path.join(root, 'dist', 'firefox');
await rm(firefox, { recursive: true, force: true });
await cp(target, firefox, { recursive: true });
await mkdir(path.join(firefox, 'gecko'), { recursive: true });
for (const file of ['compat.js', 'background.html']) await cp(path.join(root, 'gecko', file), path.join(firefox, 'gecko', file));
await cp(path.join(root, 'gecko', 'storage.js'), path.join(firefox, 'api', 'storage.js'));
const gecko = { ...manifest, ...JSON.parse(await readFile(path.join(root, 'gecko', 'manifest.json'), 'utf8')),
    manifest_version: 2,
    permissions: [...manifest.permissions.filter(value => value !== 'offscreen'), ...manifest.host_permissions],
    optional_permissions: manifest.optional_host_permissions,
    background: { page: 'gecko/background.html', persistent: true },
    browser_action: manifest.action,
    content_security_policy: manifest.content_security_policy.extension_pages,
    content_scripts: manifest.content_scripts.map(script => ({ ...script, js: ['gecko/compat.js', ...script.js] })),
};
for (const key of ['key', 'minimum_chrome_version', 'host_permissions', 'optional_host_permissions', 'action']) delete gecko[key];
await writeFile(path.join(firefox, 'manifest.json'), JSON.stringify(gecko, null, 2) + '\n');
for (const file of ['popup.html', 'background/offscreen.html']) {
    const name = path.join(firefox, file);
    const source = await readFile(name, 'utf8');
    const compat = file.includes('/') ? '../gecko/compat.js' : 'gecko/compat.js';
    await writeFile(name, source.replace(/<script\b/, `<script src="${compat}"></script>\n<script`));
}
await writeFile(path.join(root, 'dist', 'BUILD.txt'), `Buttercup Revival ${manifest.version}\nChromium: extension/\nFirefox and compatible Gecko browsers: firefox/\nSee docs/firefox.md for installation and limitations.\n`);
console.log(`Built ${manifest.name} ${manifest.version}: ${firefox}`);
console.log(`Built ${manifest.name} ${manifest.version}: ${target}`);
