"""Register Buttercup's per-user native bridge, with an optional simple wizard."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import state_directory
from backend.app.security import private_directory, private_write
from native_assistant import HOST
from browser_registration import (WINDOWS_BROWSER_KEYS, browser_registry_keys,
                                  linux_host_paths as browser_host_paths, native_host_directories,
                                  GECKO_EXTENSION_ID, GECKO_WINDOWS_KEYS, gecko_host_paths,
                                  CHROMIUM_EXTENSION_ID, LEGACY_GECKO_IDS)


def linux_host_paths(config_root, extra_directories=()):
    return browser_host_paths(config_root, HOST, extra_directories)


def registration_options(directory, extra_directories=(), extra_registry_keys=()):
    config_file = directory / 'assistant.json'
    config = json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
    directories = native_host_directories([*config.get('native_host_directories', []), *extra_directories])
    keys = browser_registry_keys([*config.get('browser_registry_keys', []), *extra_registry_keys])
    if keys and os.name != 'nt':
        raise ValueError('Custom registry keys are available only on Windows.')
    return directories, keys


def manifest_extension_id():
    # Chromium derives the ID from the manifest's public key: the first 16 bytes
    # of its SHA-256, written with the letters a-p instead of hexadecimal digits.
    key = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8')).get('key', '')
    digest = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32] if key else ''
    return ''.join(chr(ord('a') + int(digit, 16)) for digit in digest)


def gecko_registration_options(directory, extra_directories=(), extra_registry_keys=()):
    config_file = directory / 'assistant.json'
    config = json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
    directories = native_host_directories([*config.get('gecko_host_directories', []), *extra_directories])
    keys = browser_registry_keys([*config.get('gecko_registry_keys', []), *extra_registry_keys])
    if keys and os.name != 'nt':
        raise ValueError('Custom registry keys are available only on Windows.')
    return directories, keys


def uninstall(extra_directories=(), extra_registry_keys=(), gecko_directories=(), gecko_registry_keys=()):
    directory = state_directory()
    directories, keys = registration_options(directory, extra_directories, extra_registry_keys)
    gecko_directories, gecko_keys = gecko_registration_options(directory, gecko_directories, gecko_registry_keys)
    if os.name == 'nt':
        import winreg
        for browser in (*WINDOWS_BROWSER_KEYS, *keys, *GECKO_WINDOWS_KEYS, *gecko_keys):
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, 'Software\\' + browser + '\\NativeMessagingHosts\\' + HOST)
            except FileNotFoundError:
                pass
    else:
        config_root = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
        for location in [*linux_host_paths(config_root, directories), *gecko_host_paths(Path.home(), config_root, HOST, gecko_directories)]:
            location.unlink(missing_ok=True)
    if os.name == 'nt':
        for location in [*directories, *gecko_directories]:
            (location / (HOST + '.json')).unlink(missing_ok=True)
    if directory.is_dir():
        # A running service watches for this file and exits; then its data can go.
        private_write(directory / 'stop.request', 'stop\n')
        import time
        time.sleep(1.5)
        shutil.rmtree(directory, ignore_errors=True)
    return directory


def install(extension_id=None, extra_directories=(), extra_registry_keys=(), gecko_directories=(), gecko_registry_keys=()):
    # Both shipped identities are always registered. Accept either ID from the
    # popup, or no ID at all; keep custom Chromium IDs as an advanced option.
    if not extension_id or extension_id in (GECKO_EXTENSION_ID, *LEGACY_GECKO_IDS):
        extension_id = CHROMIUM_EXTENSION_ID
    if not re.fullmatch(r'[a-p]{32}', extension_id):
        raise ValueError('Use the ID shown by either Buttercup build, or leave it blank for automatic setup.')
    python = ROOT / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.is_file():
        raise RuntimeError('Install the Buttercup dependencies first. See the installation guide.')
    directory = state_directory()
    directories, keys = registration_options(directory, extra_directories, extra_registry_keys)
    gecko_directories, gecko_keys = gecko_registration_options(directory, gecko_directories, gecko_registry_keys)
    config_root = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
    chromium_paths = [path.resolve() for path in linux_host_paths(config_root, directories)] if os.name != 'nt' else [path.resolve() for path in directories]
    gecko_paths = [path.resolve() for path in gecko_host_paths(Path.home(), config_root, HOST, gecko_directories)] if os.name != 'nt' else [path.resolve() for path in gecko_directories]
    if set(chromium_paths) & set(gecko_paths) or {key.casefold() for key in (*WINDOWS_BROWSER_KEYS, *keys)} & {key.casefold() for key in (*GECKO_WINDOWS_KEYS, *gecko_keys)}:
        raise ValueError('Chromium and Gecko need separate native manifest locations.')
    private_directory(directory)
    windows_file = directory / 'installation.windows.json'
    previous = json.loads(windows_file.read_text(encoding='utf-8')) if windows_file.exists() else {}
    config_file = directory / 'assistant.json'
    config = json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
    ids = list(dict.fromkeys([item for item in [*config.get('extension_ids', []), previous.get('extension_id', ''), extension_id, CHROMIUM_EXTENSION_ID] if re.fullmatch(r'[a-p]{32}', item)]))
    tools = {name: previous.get(name) or shutil.which(name) for name in ('node', 'ffmpeg', 'ffprobe')}
    if not all(value and Path(value).is_file() for value in tools.values()):
        raise RuntimeError('Node.js or FFmpeg/FFprobe is missing. Install these components and run setup again.')
    config = {'port': config.get('port', previous.get('port', 8767)), 'extension_ids': ids, **tools,
              'native_host_directories': [str(path) for path in directories], 'browser_registry_keys': keys,
              'gecko_ids': [GECKO_EXTENSION_ID, *LEGACY_GECKO_IDS], 'gecko_host_directories': [str(path) for path in gecko_directories],
              'gecko_registry_keys': gecko_keys}
    private_write(config_file, json.dumps(config, indent=2))
    if not (directory / 'token.private.json').exists():
        private_write(directory / 'token.private.json', json.dumps({'token': secrets.token_urlsafe(32)}))
    if os.name == 'nt':
        wrapper = directory / 'assistant-host.cmd'
        # These paths come from the installation, never from browser messages.
        private_write(wrapper, f'@echo off\n"{python}" "{ROOT / "scripts" / "native_assistant.py"}" %*\n')
    else:
        wrapper = directory / 'assistant-host'
        private_write(wrapper, '#!/bin/sh\nexec ' + shlex.quote(str(python)) + ' ' + shlex.quote(str(ROOT / 'scripts' / 'native_assistant.py')) + ' "$@"\n')
        wrapper.chmod(0o700)
    manifest = {'name': HOST, 'description': 'Buttercup local audio assistant', 'path': str(wrapper),
                'type': 'stdio', 'allowed_origins': [f'chrome-extension://{item}/' for item in ids]}
    if os.name == 'nt':
        import winreg
        manifest_path = directory / (HOST + '.json')
        private_write(manifest_path, json.dumps(manifest, indent=2))
        for location in directories:
            location.mkdir(parents=True, exist_ok=True)
            private_write(location / (HOST + '.json'), json.dumps(manifest, indent=2))
        for browser in (*WINDOWS_BROWSER_KEYS, *keys):
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, 'Software\\' + browser + '\\NativeMessagingHosts\\' + HOST) as key:
                winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(manifest_path))
    else:
        config_root = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
        for location in linux_host_paths(config_root, directories):
            location.parent.mkdir(parents=True, exist_ok=True)
            private_write(location, json.dumps(manifest, indent=2))
    gecko_manifest = {key: value for key, value in manifest.items() if key != 'allowed_origins'}
    gecko_manifest['allowed_extensions'] = [GECKO_EXTENSION_ID, *LEGACY_GECKO_IDS]
    if os.name == 'nt':
        gecko_manifest_path = directory / (HOST + '.gecko.json')
        private_write(gecko_manifest_path, json.dumps(gecko_manifest, indent=2))
        for location in gecko_directories:
            location.mkdir(parents=True, exist_ok=True)
            private_write(location / (HOST + '.json'), json.dumps(gecko_manifest, indent=2))
        for browser in (*GECKO_WINDOWS_KEYS, *gecko_keys):
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, 'Software\\' + browser + '\\NativeMessagingHosts\\' + HOST) as key:
                winreg.SetValueEx(key, '', 0, winreg.REG_SZ, str(gecko_manifest_path))
    else:
        for location in gecko_host_paths(Path.home(), config_root, HOST, gecko_directories):
            location.parent.mkdir(parents=True, exist_ok=True)
            private_write(location, json.dumps(gecko_manifest, indent=2))
    # A service that is already running only knows the extensions it started
    # with. Ask it to stop; “Start and connect” opens it again with this list.
    private_write(directory / 'stop.request', 'stop\n')
    return directory


def wizard(extra_directories=(), extra_registry_keys=(), gecko_directories=(), gecko_registry_keys=()):
    import tkinter as tk
    from tkinter import messagebox
    window = tk.Tk()
    window.title('Set up Buttercup assistant')
    window.resizable(False, False)
    frame = tk.Frame(window, padx=26, pady=22)
    frame.pack()
    tk.Label(frame, text='Connect Buttercup to your computer', font=('Segoe UI', 15, 'bold')).pack(anchor='w')
    tk.Label(frame, text='Set up once, then use “Start and connect” in the extension.\nYou do not need to leave a terminal open.', justify='left', pady=12).pack(anchor='w')
    tk.Label(frame, text='Both Chromium and Firefox/Gecko are registered automatically.\nOptional extension ID override (either browser):').pack(anchor='w')
    entry = tk.Entry(frame, width=46)
    entry.pack(fill='x', pady=8)
    def configure():
        try:
            install(entry.get().strip(), extra_directories, extra_registry_keys, gecko_directories, gecko_registry_keys)
            messagebox.showinfo('Ready', 'Assistant configured!\n\nOpen Buttercup and click “Start and connect”.\nYour provider key stays in the extension.')
            window.destroy()
        except Exception as error:
            messagebox.showerror('Setup failed', str(error))
    tk.Button(frame, text='Finish setup', command=configure, padx=18, pady=8).pack(anchor='w', pady=10)
    window.mainloop()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--extension-id')
    parser.add_argument('--gui', action='store_true')
    parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--native-host-dir', action='append', default=[], metavar='DIRECTORY',
                        help='Additional native messaging manifest directory (absolute path; repeatable).')
    parser.add_argument('--browser-registry-key', action='append', default=[], metavar='VENDOR\\BROWSER',
                        help='Additional Windows browser key under HKCU\\Software (repeatable).')
    parser.add_argument('--gecko-host-dir', action='append', default=[], metavar='DIRECTORY',
                        help='Additional Gecko native messaging directory (absolute path; repeatable).')
    parser.add_argument('--gecko-registry-key', action='append', default=[], metavar='VENDOR',
                        help='Additional Gecko browser key under HKCU\\Software (repeatable).')
    args = parser.parse_args()
    if args.gui:
        wizard(args.native_host_dir, args.browser_registry_key, args.gecko_host_dir, args.gecko_registry_key)
    elif args.uninstall:
        print(f'Removed the browser registration and {uninstall(args.native_host_dir, args.browser_registry_key, args.gecko_host_dir, args.gecko_registry_key)}')
    else:
        # Without an explicit ID, authorise the extension shipped in this folder.
        extension_id = args.extension_id or manifest_extension_id()
        if not extension_id:
            parser.error('Use --gui or --extension-id ID')
        install(extension_id, args.native_host_dir, args.browser_registry_key, args.gecko_host_dir, args.gecko_registry_key)
        chromium_id = extension_id if re.fullmatch(r'[a-p]{32}', extension_id) else CHROMIUM_EXTENSION_ID
        print(f'Assistant registered for Chromium {chromium_id} and Gecko {GECKO_EXTENSION_ID}.')
