import importlib.util
import io
import json
from pathlib import Path
import struct

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('native_assistant', ROOT / 'scripts' / 'native_assistant.py')
assistant = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assistant)


def test_native_message_framing_and_limits():
    output = io.BytesIO()
    assistant.write_message(output, {'ok': True, 'message': 'conexão'})
    output.seek(0)
    assert assistant.read_message(output) == {'ok': True, 'message': 'conexão'}
    for value in (b'', struct.pack('=I', 0), struct.pack('=I', 5000), struct.pack('=I', 12) + b'{}'):
        with pytest.raises(ValueError):
            assistant.read_message(io.BytesIO(value))


def test_native_origin_and_action_before_any_process_or_secret(monkeypatch, tmp_path):
    (tmp_path / 'assistant.json').write_text(json.dumps({'port': 8767, 'extension_ids': ['a' * 32]}))
    calls = []
    monkeypatch.setattr(assistant, 'start_service', lambda *args: calls.append(True) or 'PRIVATE_LOCAL_TOKEN')
    for origin in ('', 'https://youtube.com/', 'chrome-extension://' + 'b' * 32 + '/'):
        with pytest.raises(ValueError, match='não autorizada'):
            assistant.handle({'action': 'start'}, origin, tmp_path)
    for message in ({'action': 'stop'}, {'action': 'start', 'command': 'anything'}, {'action': 'start', 'port': 9}):
        with pytest.raises(ValueError, match='não permitida'):
            assistant.handle(message, 'chrome-extension://' + 'a' * 32 + '/', tmp_path)
    assert calls == []
    result = assistant.handle({'action': 'start'}, 'chrome-extension://' + 'a' * 32 + '/', tmp_path)
    assert result == {'ok': True, 'backendUrl': 'http://127.0.0.1:8767', 'backendToken': 'PRIVATE_LOCAL_TOKEN'}
    assert calls == [True]


def test_native_config_rejects_invalid_ports_and_origins(tmp_path):
    for config in ({'port': '8767', 'extension_ids': ['a' * 32]}, {'port': 8767, 'extension_ids': ['*']}, {'port': 8767, 'extension_ids': []}):
        (tmp_path / 'assistant.json').write_text(json.dumps(config))
        with pytest.raises(ValueError):
            assistant.load_config(tmp_path)
