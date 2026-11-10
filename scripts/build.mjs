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
for (const name of ['manifest.json', 'buttercup.js', 'content.js', 'popup.html', 'api', 'background', 'cache', 'subtitles', 'integrations', 'icons', 'locales', '_locales']) {
    await cp(path.join(root, name), path.join(target, name), { recursive: true });
}
await mkdir(path.join(target, 'assets', 'css'), { recursive: true });
await mkdir(path.join(target, 'assets', 'js'), { recursive: true });
await cp(path.join(root, 'assets', 'css', 'popup.css'), path.join(target, 'assets', 'css', 'popup.css'));
await cp(path.join(root, 'assets', 'js', 'buttons.js'), path.join(target, 'assets', 'js', 'buttons.js'));
const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'));
await writeFile(path.join(root, 'dist', 'BUILD.txt'), `Buttercup Revival ${manifest.version}\nLoad the extension/ directory in Chrome.\n`);
console.log(`Built ${manifest.name} ${manifest.version}: ${target}`);
