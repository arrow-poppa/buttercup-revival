"""Build the downloadable release: dist/Buttercup-Revival.zip.

The archive is what a user extracts and installs from: the committed files,
without the development-only ones, plus the extension already built.
"""
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'Buttercup-Revival'
# Needed to develop Buttercup, not to install or run it.
DEVELOPMENT = ('.github/', 'tests/', 'cache-service/', 'scripts/browser-', 'scripts/install-browser.mjs',
               'scripts/live-extraction.py', 'scripts/package.py', 'backend/requirements-dev.txt', 'pytest.ini',
               'package-lock.json', 'assets/js/tailwindcss', 'assets/css/daisyui', '.prettierrc', '.gitignore', '.gitattributes')


def main():
    stage = ROOT / 'dist' / 'package' / NAME
    shutil.rmtree(stage.parent, ignore_errors=True)
    stage.mkdir(parents=True)
    # git archive applies the repository's line-ending rules, so .cmd files are
    # CRLF and .sh files LF whatever this checkout uses.
    archive = subprocess.run(['git', 'archive', '--format=tar', 'HEAD'], cwd=ROOT, check=True, capture_output=True).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        members = [member for member in source.getmembers() if not member.name.startswith(DEVELOPMENT)]
        source.extractall(stage, members=members, filter='data')
    subprocess.run(['node', str(stage / 'scripts' / 'build.mjs')], check=True, capture_output=True)
    version = json.loads((stage / 'manifest.json').read_text(encoding='utf-8'))['version']
    target = ROOT / 'dist' / f'{NAME}.zip'
    target.unlink(missing_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path in sorted(stage.rglob('*')):
            if path.is_dir() or path.name == 'BUILD.txt':
                continue
            entry = zipfile.ZipInfo.from_file(path, f'{NAME}/{path.relative_to(stage).as_posix()}')
            entry.compress_type = zipfile.ZIP_DEFLATED
            # Windows has no executable bit to copy; shell scripts need one on Linux.
            entry.external_attr = (0o100755 if path.suffix == '.sh' else 0o100644) << 16
            output.writestr(entry, path.read_bytes())
    shutil.rmtree(stage.parent)
    print(f'{NAME} {version}: {target} ({target.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
