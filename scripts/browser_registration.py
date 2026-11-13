"""Per-user native messaging locations for Chromium and Gecko browsers.

Forks choose their own Linux configuration directory. Windows browsers commonly
reuse Chrome's registry entry; custom locations cover portable and new forks.
"""
import json
from pathlib import Path
import re

LINUX_BROWSER_DIRS = (
    'google-chrome', 'google-chrome-beta', 'google-chrome-unstable',
    'google-chrome-for-testing', 'chromium', 'chromium-browser',
    'microsoft-edge', 'microsoft-edge-beta', 'microsoft-edge-dev',
    'BraveSoftware/Brave-Browser', 'BraveSoftware/Brave-Browser-Beta',
    'BraveSoftware/Brave-Browser-Nightly', 'BraveSoftware/Brave-Origin',
    'BraveSoftware/Brave-Origin-Beta', 'BraveSoftware/Brave-Origin-Nightly',
    'vivaldi', 'vivaldi-snapshot', 'opera', 'opera-beta', 'opera-developer',
    'ungoogled-chromium', 'thorium',
)
# Brave, Vivaldi, Opera and many other Chromium forks also read Chrome's key.
WINDOWS_BROWSER_KEYS = ('Google\\Chrome', 'Microsoft\\Edge', 'Chromium')


def native_host_directories(values):
    result = []
    for value in values:
        path = Path(value).expanduser()
        if not path.is_absolute():
            raise ValueError('Native host directories must be absolute paths.')
        if path not in result:
            result.append(path)
    return result


def browser_registry_keys(values):
    result = []
    for value in values:
        # All writes stay in HKCU\\Software. Accept the browser-specific part,
        # never a hive, a host name, or a command.
        if not re.fullmatch(r'[\w .-]+(?:\\[\w .-]+)*', value) or any(
                part in ('.', '..') for part in value.split('\\')):
            raise ValueError('Use a browser registry key relative to HKCU\\Software, such as Vendor\\Browser.')
        if value not in result:
            result.append(value)
    return result


def linux_host_paths(config_root, host, extra_directories=()):
    directories = [Path(config_root) / browser / 'NativeMessagingHosts' for browser in LINUX_BROWSER_DIRS]
    return list(dict.fromkeys(directory / (host + '.json')
                              for directory in [*directories, *native_host_directories(extra_directories)]))


# Use the same stable identity as the generated Firefox manifest.
GECKO_EXTENSION_ID = json.loads((Path(__file__).resolve().parents[1] / 'gecko' / 'manifest.json').read_text(encoding='utf-8'))['browser_specific_settings']['gecko']['id']
GECKO_WINDOWS_KEYS = ('Mozilla',)


def gecko_host_paths(home, config_root, host, extra_directories=()):
    # Firefox and Zen share Mozilla's native-host lookup. LibreWolf has its own
    # directory. Include legacy and XDG layouts; custom locations cover forks.
    directories = [Path(home) / '.mozilla' / 'native-messaging-hosts',
                   Path(home) / '.librewolf' / 'native-messaging-hosts',
                   Path(config_root) / 'mozilla' / 'native-messaging-hosts',
                   Path(config_root) / 'librewolf' / 'native-messaging-hosts']
    return list(dict.fromkeys(directory / (host + '.json')
                             for directory in [*directories, *native_host_directories(extra_directories)]))
