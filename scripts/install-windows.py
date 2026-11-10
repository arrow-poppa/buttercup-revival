"""Prepare a per-user Windows installation without changing the global Python."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import state_directory
from backend.app.security import private_directory, private_write


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--browser', choices=['edge', 'chrome'], required=True)
    parser.add_argument('--executable', type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != 'win32':
        parser.error('This installer is for Windows only')
    required = {name: shutil.which(name) for name in ('node', 'ffmpeg', 'ffprobe')}
    if not all(required.values()):
        raise RuntimeError('Install Node.js, FFmpeg and FFprobe before running this installer')
    if not args.executable.is_file() or not (ROOT / 'dist' / 'extension' / 'manifest.json').is_file():
        raise RuntimeError('Browser executable or compiled extension is missing')
    directory = private_directory(state_directory())
    token_file = directory / 'token.private.json'
    if not token_file.exists():
        private_write(token_file, json.dumps({'token': secrets.token_urlsafe(32)}))
    config_file = directory / 'installation.windows.json'
    existing = json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
    config = {**existing, 'project': str(ROOT), 'browser': str(args.executable.resolve()),
              'browser_kind': args.browser, 'browser_profile': str(directory / ('browser-' + args.browser)),
              'port': 8767, **required, 'installed_at': datetime.now(timezone.utc).isoformat()}
    private_write(config_file, json.dumps(config, indent=2))
    print(json.dumps({'state': str(directory), 'browser': args.browser, 'dependencies': 'ready'}))


if __name__ == '__main__':
    main()
