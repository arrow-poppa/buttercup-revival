"""Hidden, gracefully stoppable local backend for the Windows installation."""
import json
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.config import Settings, state_directory
from backend.app.main import create_app


def main():
    import uvicorn
    directory = state_directory()
    config = json.loads((directory / 'installation.windows.json').read_text(encoding='utf-8'))
    token = json.loads((directory / 'token.private.json').read_text(encoding='utf-8'))['token']
    settings = Settings(token=token, origins=('chrome-extension://' + config['extension_id'],),
                        state_dir=directory, ffmpeg=config['ffmpeg'], ffprobe=config['ffprobe'])
    server = uvicorn.Server(uvicorn.Config(create_app(settings), host='127.0.0.1',
        port=config.get('port', 8767), access_log=False, log_level='warning'))
    done = threading.Event()
    def watch():
        while not done.wait(.25):
            if (directory / 'stop.request').exists():
                server.should_exit = True
                return
    watcher = threading.Thread(target=watch, daemon=True)
    watcher.start()
    try:
        server.run()
    finally:
        done.set()
        (directory / 'stop.request').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
