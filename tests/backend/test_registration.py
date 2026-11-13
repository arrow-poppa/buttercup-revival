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
    monkeypatch.setattr(setup.Path, 'home', lambda: tmp_path / 'home')
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
        assert manifest['allowed_origins'] == ['chrome-extension://' + item + '/' for item in ['a' * 32, setup.CHROMIUM_EXTENSION_ID, 'b' * 32]]
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
    assert set(registry) == expected | {'Software\\Mozilla\\NativeMessagingHosts\\' + setup.HOST}
    assert set(registry.values()) == {str(state / (setup.HOST + '.json')), str(state / (setup.HOST + '.gecko.json'))}
    gecko = json.loads((state / (setup.HOST + '.gecko.json')).read_text())
    assert gecko['allowed_extensions'] == [setup.GECKO_EXTENSION_ID, *setup.LEGACY_GECKO_IDS]
    assert 'allowed_origins' not in gecko
    assert (custom / (setup.HOST + '.json')).exists()
    setup.install('b' * 32)
    assert set(registry) == expected | {'Software\\Mozilla\\NativeMessagingHosts\\' + setup.HOST}
    setup.uninstall()
    assert not registry
    assert not (custom / (setup.HOST + '.json')).exists()


@pytest.mark.skipif(os.name == 'nt', reason='Linux native messaging filesystem layout')
def test_gecko_registration_preserves_separate_manifests_and_custom_paths(installation):
    state, config, project = installation
    custom = config / 'another-gecko/native-messaging-hosts'
    setup.install('a' * 32, gecko_directories=[custom])
    setup.install('a' * 32)
    paths = setup.gecko_host_paths(Path.home(), config, setup.HOST, [custom])
    for path in paths:
        manifest = json.loads(path.read_text())
        assert manifest['allowed_extensions'] == [setup.GECKO_EXTENSION_ID, *setup.LEGACY_GECKO_IDS]
        assert 'allowed_origins' not in manifest
        assert path.stat().st_mode & 0o777 == 0o600
    chromium = json.loads(setup.linux_host_paths(config)[0].read_text())
    assert 'allowed_extensions' not in chromium
    assert json.loads((state / 'assistant.json').read_text())['gecko_host_directories'] == [str(custom)]
    setup.uninstall()
    assert all(not path.exists() for path in paths)


def test_registration_rejects_cross_engine_manifest_collisions(installation):
    state, config, project = installation
    with pytest.raises(ValueError, match='separate'):
        setup.install('a' * 32, extra_directories=[config / 'shared'], gecko_directories=[config / 'shared'])
    assert not state.exists()


@pytest.mark.parametrize('identity', [None, '', setup.CHROMIUM_EXTENSION_ID, setup.GECKO_EXTENSION_ID, *setup.LEGACY_GECKO_IDS])
def test_either_browser_id_automatically_registers_both(installation, identity):
    state, config, project = installation
    setup.install(identity)
    saved = json.loads((state / 'assistant.json').read_text())
    assert saved['extension_ids'] == [setup.CHROMIUM_EXTENSION_ID]
    assert saved['gecko_ids'] == [setup.GECKO_EXTENSION_ID, *setup.LEGACY_GECKO_IDS]


def test_manual_pairing_binds_exact_origin_and_writes_private_connection(installation, monkeypatch):
    from backend.app.config import Settings
    state, config, project = installation
    setup.install()
    token = 'SYNTHETIC_LOCAL_CONNECTION_TOKEN_' * 2
    monkeypatch.setitem(setup.native_start.__globals__, 'start_service', lambda *args: token)
    destination = config / 'connection.private.json'
    origin = 'moz-extension://12345678-1234-1234-1234-123456789abc'
    settings = Settings(token=token, origins=('chrome-extension://' + setup.CHROMIUM_EXTENSION_ID,), state_dir=state, gecko_ids=(setup.GECKO_EXTENSION_ID,))
    for bad in ('https://evil.example', 'moz-extension://*', setup.GECKO_EXTENSION_ID, origin+'/'):
        with pytest.raises(ValueError):
            setup.manual_connection(bad, destination)
    assert not destination.exists() and not settings.allows_origin(origin)
    setup.manual_connection(origin, destination)
    assert settings.allows_origin(origin)
    assert json.loads(destination.read_text()) == {'app':'buttercup-connection','origin':origin,'backendUrl':'http://127.0.0.1:8767','backendToken':token}
    if os.name != 'nt':
        assert destination.stat().st_mode & 0o777 == 0o600
