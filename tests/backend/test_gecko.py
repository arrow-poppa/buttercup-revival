"""Gecko pairing must extend the origin allowlist without weakening authentication."""
import json
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import native_assistant as assistant
from browser_registration import GECKO_EXTENSION_ID

ORIGIN = 'moz-extension://12345678-1234-1234-1234-123456789abc'
TOKEN = 'SYNTHETIC_GECKO_TEST_TOKEN_' * 2
CHROME = 'chrome-extension://' + 'a' * 32


@pytest.fixture
def config(tmp_path):
    (tmp_path / 'assistant.json').write_text(json.dumps({
        'port': 8767, 'extension_ids': ['a' * 32], 'gecko_ids': [GECKO_EXTENSION_ID],
    }))
    return tmp_path


def test_native_authenticates_logical_id_before_trusting_origin(config, monkeypatch):
    calls = []
    monkeypatch.setattr(assistant, 'start_service', lambda *args: calls.append(True) or TOKEN)
    for addon_id in ('other@example.org', ORIGIN, ''):
        with pytest.raises(ValueError, match='Unauthorized'):
            assistant.handle({'action': 'start', 'origin': ORIGIN}, '/test/host.json', config, addon_id)
    for origin in ('moz-extension://*', ORIGIN + '/', ORIGIN + '/../../x', 'https://example.org', CHROME, None):
        with pytest.raises(ValueError, match='origin'):
            assistant.handle({'action': 'start', 'origin': origin}, '/test/host.json', config, GECKO_EXTENSION_ID)
    for message in ({'action': 'start'}, {'action': 'start', 'origin': ORIGIN, 'command': 'bad'}, {'action': 'stop', 'origin': ORIGIN}):
        with pytest.raises(ValueError, match='not allowed'):
            assistant.handle(message, '/test/host.json', config, GECKO_EXTENSION_ID)
    assert not calls and not (config / 'gecko-origins').exists()
    result = assistant.handle({'action': 'start', 'origin': ORIGIN}, '/test/host.json', config, GECKO_EXTENSION_ID)
    assert result['backendToken'] == TOKEN and calls == [True]
    assert json.loads((config / 'gecko-origins' / (ORIGIN.split('//')[1] + '.json')).read_text()) == {'extension_id': GECKO_EXTENSION_ID}


def test_pairing_updates_live_cors_without_restarting_or_relaxing_auth(config, monkeypatch):
    monkeypatch.setattr(assistant, 'start_service', lambda *args: TOKEN)
    settings = Settings(token=TOKEN, origins=(CHROME,), state_dir=config, gecko_ids=(GECKO_EXTENSION_ID,))
    with TestClient(create_app(settings), base_url='http://127.0.0.1') as client:
        headers = {'Origin': ORIGIN, 'Authorization': 'Bearer ' + TOKEN}
        assert client.get('/health', headers=headers).status_code == 403
        assistant.handle({'action': 'start', 'origin': ORIGIN}, '/test/host.json', config, GECKO_EXTENSION_ID)
        response = client.get('/health', headers=headers)
        assert response.status_code == 200
        assert response.headers['access-control-allow-origin'] == ORIGIN
        preflight = client.options('/health', headers={'Origin': ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization'})
        assert preflight.status_code == 200 and preflight.headers['access-control-allow-origin'] == ORIGIN
        assert client.get('/health', headers={'Origin': ORIGIN}).status_code == 401
        assert client.get('/health', headers={**headers, 'Host': 'evil.example'}).status_code == 403
        for denied in ('https://www.youtube.com', ORIGIN.replace('12345678-', '87654321-'), 'null'):
            assert client.get('/health', headers={**headers, 'Origin': denied}).status_code == 403
            assert client.options('/health', headers={'Origin': denied, 'Access-Control-Request-Method': 'GET'}).status_code == 403
        assert client.get('/health', headers={**headers, 'Origin': CHROME}).status_code == 200
        binding = config / 'gecko-origins' / (ORIGIN.split('//')[1] + '.json')
        for corrupt in ('{', '[]', json.dumps({'extension_id': 'other@example.org'})):
            binding.write_text(corrupt)
            assert client.get('/health', headers=headers).status_code == 403


def test_manual_firefox_origin_is_exact_and_never_a_wildcard(tmp_path):
    settings = Settings(token=TOKEN, origins=(ORIGIN,), state_dir=tmp_path)
    assert settings.allows_origin(ORIGIN)
    assert not settings.allows_origin(ORIGIN.replace('12345678-', '87654321-'))
    for origin in ('moz-extension://*', ORIGIN + '/', 'moz-extension://addon@example.org', 'https://example.org'):
        with pytest.raises(ValueError):
            Settings(token=TOKEN, origins=(origin,), state_dir=tmp_path)
