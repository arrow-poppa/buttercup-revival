#!/bin/sh
# Buttercup Revival - one-step setup for Linux.
# Installs what is missing (Python, Node.js, FFmpeg) with your package manager,
# prepares the local assistant inside this folder and registers it for
# Chromium-based browsers. Only the package installation asks for your password.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

have() { command -v "$1" >/dev/null 2>&1; }
step() { printf '\n\033[36m[%s/5] %s\033[0m\n' "$1" "$2"; }
note() { printf '      %s\n' "$1"; }
fail() { printf '\n\033[31m  The installation stopped:\n  %s\033[0m\n\n' "$1" >&2; exit 1; }

# One name per program, in the spelling each package manager uses.
install_packages() {
    if have apt-get; then
        sudo apt-get update && sudo apt-get install -y "$@"
    elif have dnf; then
        sudo dnf install -y "$@"
    elif have pacman; then
        sudo pacman -S --needed --noconfirm "$@"
    elif have zypper; then
        sudo zypper install -y "$@"
    else
        fail "No supported package manager found. Install these yourself, then run this again: $*"
    fi
}
package() {
    # $1 = what is needed: python, venv, node or ffmpeg
    if have apt-get; then
        case $1 in python) echo python3 ;; venv) echo python3-venv ;; node) echo nodejs ;; ffmpeg) echo ffmpeg ;; esac
    elif have dnf; then
        case $1 in python) echo python3 ;; venv) echo python3 ;; node) echo nodejs ;; ffmpeg) echo ffmpeg-free ;; esac
    elif have pacman; then
        case $1 in python) echo python ;; venv) echo python ;; node) echo nodejs ;; ffmpeg) echo ffmpeg ;; esac
    else
        case $1 in python) echo python3 ;; venv) echo python3 ;; node) echo nodejs ;; ffmpeg) echo ffmpeg ;; esac
    fi
}

printf '\n\033[35m  Buttercup Revival\033[0m\n  Setting everything up.\n'

step 1 'Checking the programs Buttercup needs'
missing=''
have python3 || missing="$missing $(package python)"
have node || missing="$missing $(package node)"
{ have ffmpeg && have ffprobe; } || missing="$missing $(package ffmpeg)"
# Debian and Ubuntu ship the venv module separately.
if have python3 && ! python3 -c 'import ensurepip, venv' >/dev/null 2>&1; then missing="$missing $(package venv)"; fi
if [ -n "$missing" ]; then
    note "Installing:$missing (your password may be requested)"
    # shellcheck disable=SC2086
    install_packages $missing
fi
have python3 || fail 'Python 3 is still missing. Install Python 3.11 or newer and run this again.'
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' \
    || fail "Python 3.11 or newer is required; this system has $(python3 --version 2>&1). Install a newer Python and run this again."
python3 -c 'import ensurepip, venv' >/dev/null 2>&1 || fail "Python's venv module is missing. Install it (Debian/Ubuntu: sudo apt install python3-venv) and run this again."
note "Python: OK ($(python3 --version 2>&1))"
have node || fail 'Node.js is still missing. Install Node.js 20 or newer (https://nodejs.org) and run this again.'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
    || fail "Node.js 20 or newer is required; this system has $(node --version). Your distribution's package is too old: install a current one from https://nodejs.org or https://github.com/nodesource/distributions and run this again."
note "Node.js: OK ($(node --version))"
{ have ffmpeg && have ffprobe; } || fail 'FFmpeg (ffmpeg and ffprobe) is still missing. Install it and run this again.'
note 'FFmpeg: OK'

step 2 'Preparing the local assistant (downloads its components)'
[ -x .venv/bin/python ] || python3 -m venv .venv || fail 'Could not create the assistant environment.'
.venv/bin/python -m pip install --quiet --disable-pip-version-check --upgrade -r backend/requirements.txt \
    || fail 'Could not download the assistant components. Check your internet connection and run this again.'

step 3 'Preparing the browser extension'
node scripts/build.mjs || fail 'Could not prepare the extension folder.'

step 4 'Connecting the assistant to your browsers'
.venv/bin/python scripts/setup-assistant.py || fail 'Could not register the assistant.'

step 5 'One last step, done by you in the browser'
extension="$root/dist/extension"
printf '\n\033[32m  Installed! Now add the extension to your browser:\033[0m\n\n'
note '1. Open your Chromium-based browser and go to:   chrome://extensions'
note '2. Turn on "Developer mode" (a switch on that page).'
note '3. Click "Load unpacked" and choose this folder:'
printf '         \033[33m%s\033[0m\n' "$extension"
note '4. Click the Buttercup icon, then "Start and connect".'
printf '\n'
note 'Do not move or delete this folder afterwards: the extension runs from it.'
note 'For Snap, Flatpak or a custom Chromium fork, see docs/BROWSERS.md for connection options.'
note 'The full guide, with pictures, is in README.md.'
printf '\n'
