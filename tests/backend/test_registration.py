"""Registration tests use temporary directories and a fake Windows registry."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
from types import SimpleNamespace

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from browser_registration import browser_registry_keys, linux_host_paths, native_host_directories

spec = importlib.util.spec_from_file_location('setup_assistant', SCRIPTS / 'setup-assistant.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


def test_linux_browser_families_and_channels(tmp_path):
    paths = linux_host_paths(tmp_path, setup.HOST)
    for browser in ('google-chrome', 'google-chrome-beta', 'google-chrome-unstable',
                    'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-beta',
                    'BraveSoftware/Brave-Browser', 'BraveSoftware/Brave-Browser-Nightly',
                    'BraveSoftware/Brave-Origin', 'BraveSoftware/Brave-Origin-Beta',
                    'vivaldi', 'vivaldi-snapshot', 'opera', 'opera-developer',
                    'ungoogled-chromium', 'thorium'):
        assert tmp_path / browser / 'NativeMessagingHosts' / (setup.HOST + '.json') in paths
    assert len(paths) == len(set(paths))


@pytest.mark.parametrize('value', ['relative/path', '../NativeMessagingHosts'])
def test_custom_manifest_directories_require_absolute_paths(value):
    with pytest.raises(ValueError, match='absolute'):
        native_host_directories([value])


@pytest.mark.parametrize('value', ['', '..', 'Vendor\\..\\Browser', 'Vendor/Browser', 'Vendor\\', 'C:\\Browser'])
def test_custom_registry_keys_reject_invalid_paths(value):
    with pytest.raises(ValueError, match='registry key'):
        browser_registry_keys([value])


@pytest.fixture
def installation(tmp_path, monkeypatch):
    project = tmp_path / 'project with spaces'
    python = project / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    python.parent.mkdir(parents=True)
    python.touch()
    state = tmp_path / 'state'
    config = tmp_path / 'config'
    monkeypatch.setattr(setup, 'ROOT', project)
    monkeypatch.setattr(setup, 'state_directory', lambda: state)
    monkeypatch.setattr(setup.shutil, 'which', lambda name: str(python))
    monkeypatch.setenv('XDG_CONFIG_HOME', str(config))
    monkeypatch.setattr(time, 'sleep', lambda seconds: None)
    return state, config, project


@pytest.mark.skipif(os.name == 'nt', reason='Linux native messaging filesystem layout')
def test_install_reinstall_and_uninstall_preserve_custom_locations_and_pairing(installation):
    state, config, project = installation
    custom = config.parent / 'portable browser' / 'NativeMessagingHosts'
    setup.install('a' * 32, [custom, custom])
    token = (state / 'token.private.json').read_bytes()
    settings = json.loads((state / 'assistant.json').read_text())
    settings['port'] = 9876
    (state / 'assistant.json').write_text(json.dumps(settings))
    # Re-running the ordinary installer retains custom browsers, IDs and token.
    setup.install('b' * 32)
    settings = json.loads((state / 'assistant.json').read_text())
    assert settings['native_host_directories'] == [str(custom)]
    assert settings['port'] == 9876
    assert (state / 'token.private.json').read_bytes() == token
    for path in setup.linux_host_paths(config, [custom]):
        manifest = json.loads(path.read_text())
        assert manifest['allowed_origins'] == ['chrome-extension://' + char * 32 + '/' for char in 'ab']
        assert manifest['type'] == 'stdio'
        assert manifest['path'] == str(state / 'assistant-host')
        assert path.stat().st_mode & 0o777 == 0o600
    assert (state / 'assistant-host').stat().st_mode & 0o777 == 0o700
    assert "'" + str(project / '.venv/bin/python') + "'" in (state / 'assistant-host').read_text()
    unrelated = custom / 'another.host.json'
    unrelated.write_text('{}')
    setup.uninstall()
    assert not state.exists()
    assert all(not path.exists() for path in setup.linux_host_paths(config, [custom]))
    assert unrelated.exists()


def test_windows_registration_and_uninstall_use_same_default_and_custom_keys(installation, monkeypatch):
    state, config, project = installation
    python = project / '.venv/Scripts/python.exe'
    python.parent.mkdir(parents=True, exist_ok=True)
    python.touch()
    # Replace only the setup module's OS view; pathlib and pytest keep the real OS.
    monkeypatch.setattr(setup, 'os', SimpleNamespace(name='nt', environ=os.environ))
    monkeypatch.setattr(setup, 'private_directory', lambda path: path.mkdir(parents=True, exist_ok=True))
    registry = {}

    class Key:
        def __init__(self, hive, name):
            assert hive == 'HKCU'
            self.name = name
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    fake = SimpleNamespace(HKEY_CURRENT_USER='HKCU', REG_SZ=1, CreateKey=Key,
                           SetValueEx=lambda key, name, reserved, kind, value: registry.__setitem__(key.name, value),
                           DeleteKey=lambda hive, name: registry.pop(name))
    monkeypatch.setitem(sys.modules, 'winreg', fake)
    custom = config / 'Portable/NativeMessagingHosts'
    setup.install('a' * 32, [custom], ['Example\\Browser'])
    expected = {'Software\\' + browser + '\\NativeMessagingHosts\\' + setup.HOST
                for browser in ('Google\\Chrome', 'Microsoft\\Edge', 'Chromium', 'Example\\Browser')}
    assert set(registry) == expected
    assert set(registry.values()) == {str(state / (setup.HOST + '.json'))}
    assert (custom / (setup.HOST + '.json')).exists()
    setup.install('b' * 32)
    assert set(registry) == expected
    setup.uninstall()
    assert not registry
    assert not (custom / (setup.HOST + '.json')).exists()
