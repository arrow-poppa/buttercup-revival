"""Installed Windows shortcuts: start/stop the local service and open Buttercup."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import URLError, HTTPError
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import state_directory
from backend.app.security import private_write


def health(directory, port):
    token = json.loads((directory / 'token.private.json').read_text(encoding='utf-8'))['token']
    request = Request(f'http://127.0.0.1:{port}/health', headers={'Authorization': f'Bearer {token}'})
    try:
        with build_opener(ProxyHandler({})).open(request, timeout=2) as response:
            payload = json.load(response)
        if payload.get('version') != '0.2.0' or 'yt_dlp' not in payload:
            raise RuntimeError('The configured port is being used by another service.')
        return payload
    except HTTPError:
        raise RuntimeError('The configured port is in use with another token. Check the installation.') from None
    except (URLError, TimeoutError, OSError):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stop', action='store_true')
    parser.add_argument('--backend-only', action='store_true')
    parser.add_argument('--settings', action='store_true')
    parser.add_argument('--console', action='store_true')
    args = parser.parse_args()
    directory = state_directory()
    # The installer writes assistant.json; installation.windows.json is the older layout.
    modern = (directory / 'assistant.json').exists()
    config = json.loads((directory / ('assistant.json' if modern else 'installation.windows.json')).read_text(encoding='utf-8'))
    port = config.get('port', 8767)
    if args.stop:
        if health(directory, port) is not None:
            private_write(directory / 'stop.request', 'stop\n')
            for _ in range(60):
                if health(directory, port) is None:
                    return
                time.sleep(.25)
            raise RuntimeError('The backend is still finishing its current job. Wait a few seconds.')
        return
    if health(directory, port) is None:
        environment = os.environ.copy()
        environment['PATH'] = str(Path(config['node']).parent) + os.pathsep + environment.get('PATH', '')
        (directory / 'stop.request').unlink(missing_ok=True)
        with (directory / 'backend.log').open('ab') as log:
            subprocess.Popen([str(ROOT / '.venv' / 'Scripts' / 'pythonw.exe'),
                              str(ROOT / 'scripts' / ('assistant-service.py' if modern else 'windows-service.py'))], cwd=ROOT, env=environment,
                             stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
        for _ in range(100):
            if health(directory, port) is not None:
                break
            time.sleep(.2)
        else:
            raise RuntimeError(f'The backend did not start. See {directory / "backend.log"}.')
    if args.settings and not args.backend_only and config.get('browser'):
        browser_args = [config['browser'], '--user-data-dir=' + config['browser_profile'], '--no-first-run']
        if config.get('browser_kind') == 'edge':
            browser_args.append('--load-extension=' + str(ROOT / 'dist' / 'chromium'))
        browser_args.append(f'chrome-extension://{config["extension_id"]}/popup.html' if args.settings else 'https://www.youtube.com/')
        # This is the interactive browser the user explicitly opens via the shortcut.
        subprocess.Popen(browser_args, cwd=ROOT)
    if args.console:
        print(f'Buttercup running at http://127.0.0.1:{port}')
    elif not args.backend_only:
        ctypes.windll.user32.MessageBoxW(None,
            'Local assistant started!\n\nOpen Buttercup in your browser and generate subtitles.\n'
            'You can close this message. The assistant will keep running.', 'Buttercup is ready', 0x40)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if '--console' in sys.argv:
            print(str(error), file=sys.stderr)
        else:
            ctypes.windll.user32.MessageBoxW(None, str(error), 'Buttercup Revival', 0x10)
        raise SystemExit(1)
