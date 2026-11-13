"""Detached local audio service, shared by Windows and Linux."""
from pathlib import Path
import json
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import Settings, state_directory
from backend.app.main import create_app
from native_assistant import load_config


def main():
    import uvicorn
    directory = state_directory()
    config = load_config(directory)
    token = json.loads((directory / 'token.private.json').read_text(encoding='utf-8'))['token']
    settings = Settings(token=token, origins=tuple('chrome-extension://' + item for item in config['extension_ids']),
                        state_dir=directory, gecko_ids=tuple(config.get('gecko_ids', [])), ffmpeg=config['ffmpeg'], ffprobe=config['ffprobe'])
    server = uvicorn.Server(uvicorn.Config(create_app(settings), host='127.0.0.1', port=config['port'],
                                          access_log=False, log_level='warning'))
    done = threading.Event()
    def watch():
        while not done.wait(.25):
            if (directory / 'stop.request').exists():
                server.should_exit = True
                return
    threading.Thread(target=watch, daemon=True).start()
    try:
        server.run()
    finally:
        done.set()
        (directory / 'stop.request').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
