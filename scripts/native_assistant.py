"""Small, allowlisted browser bridge: start the local service and pair it.

No arbitrary commands, paths, environment variables, or URLs are accepted from
the browser. stdout is reserved for the native messaging protocol.
"""
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import state_directory

HOST = 'app.buttercup.assistant'


def load_config(directory):
    config = json.loads((directory / 'assistant.json').read_text(encoding='utf-8'))
    ids = config.get('extension_ids', [])
    if not ids or any(not re.fullmatch(r'[a-p]{32}', item) for item in ids):
        raise ValueError('Configure novamente o assistente com o ID da extensão.')
    if type(config.get('port')) is not int or not 1 <= config['port'] <= 65535:
        raise ValueError('Porta inválida. Configure novamente o assistente.')
    return config


def read_message(stream):
    header = stream.read(4)
    if len(header) != 4:
        raise ValueError('Mensagem incompleta.')
    size = struct.unpack('=I', header)[0]
    if not 1 <= size <= 4096:
        raise ValueError('Mensagem inválida.')
    body = stream.read(size)
    if len(body) != size:
        raise ValueError('Mensagem incompleta.')
    return json.loads(body)


def write_message(stream, value):
    body = json.dumps(value, ensure_ascii=False).encode('utf-8')
    stream.write(struct.pack('=I', len(body)) + body)
    stream.flush()


def probe(directory, config):
    token = json.loads((directory / 'token.private.json').read_text(encoding='utf-8'))['token']
    request = Request(f'http://127.0.0.1:{config["port"]}/health', headers={'Authorization': f'Bearer {token}'})
    try:
        with build_opener(ProxyHandler({})).open(request, timeout=1) as response:
            health = json.load(response)
        if health.get('status') != 'ok' or health.get('version') != '0.2.0' or 'yt_dlp' not in health:
            raise RuntimeError('Outro programa está usando a porta do Buttercup. Feche-o e tente novamente.')
        return token
    except HTTPError:
        raise RuntimeError('Outro serviço está usando a porta com uma conexão diferente. Reinicie o Buttercup.') from None
    except (URLError, TimeoutError, OSError):
        return None


def start_service(directory, config):
    # Serialize starts from multiple popups/browsers. The backend has a separate
    # lifetime lock, so this never creates two live servers sharing job storage.
    from backend.app.lock import InstanceLock
    with InstanceLock(directory / 'assistant-start.lock'):
        token = probe(directory, config)
        if token:
            return token
        environment = os.environ.copy()
        environment['PATH'] = str(Path(config['node']).parent) + os.pathsep + environment.get('PATH', '')
        (directory / 'stop.request').unlink(missing_ok=True)
        python = ROOT / '.venv' / ('Scripts/pythonw.exe' if os.name == 'nt' else 'bin/python')
        options = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {'start_new_session': True}
        with (directory / 'backend.log').open('ab') as log:
            subprocess.Popen([str(python), str(ROOT / 'scripts' / 'assistant-service.py')], cwd=ROOT,
                             env=environment, stdin=subprocess.DEVNULL, stdout=log, stderr=log, **options)
        for _ in range(100):
            token = probe(directory, config)
            if token:
                return token
            time.sleep(.15)
    raise RuntimeError('O assistente não conseguiu abrir. Execute “Configurar assistente Buttercup” para verificar a instalação.')


def handle(message, origin, directory):
    config = load_config(directory)
    if origin not in [f'chrome-extension://{item}/' for item in config['extension_ids']]:
        raise ValueError('Extensão não autorizada. Configure o assistente para este navegador.')
    if message != {'action': 'start'}:
        raise ValueError('Ação não permitida.')
    token = start_service(directory, config)
    return {'ok': True, 'backendUrl': f'http://127.0.0.1:{config["port"]}', 'backendToken': token}


def main():
    if os.name == 'nt':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    try:
        result = handle(read_message(sys.stdin.buffer), sys.argv[1] if len(sys.argv) > 1 else '', state_directory())
    except (FileNotFoundError, PermissionError):
        result = {'ok': False, 'error': 'Instalação incompleta. Execute “Configurar assistente Buttercup” novamente.'}
    except Exception as error:
        # Never echo request data, configuration or secrets into browser errors.
        safe = str(error) if isinstance(error, (ValueError, RuntimeError)) else 'Não foi possível abrir o assistente local.'
        result = {'ok': False, 'error': safe}
    write_message(sys.stdout.buffer, result)


if __name__ == '__main__':
    main()
