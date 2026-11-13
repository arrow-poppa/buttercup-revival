import argparse
import json
import os
import secrets

from .config import Settings, state_directory
from .main import create_app
from .security import private_directory, private_write


def main():
    parser = argparse.ArgumentParser(description="Buttercup local backend (127.0.0.1 only)")
    parser.add_argument("--extension-id", action="append", default=[], help="Chromium extension ID (repeatable)")
    parser.add_argument("--firefox-origin", action="append", default=[], help="Exact moz-extension://UUID from this Firefox profile (repeatable)")
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--state-dir", type=__import__("pathlib").Path, default=state_directory())
    parser.add_argument("--max-duration", type=int, default=14400)
    parser.add_argument("--max-storage-mb", type=int, default=1024)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--js-runtime", choices=["node", "deno", "quickjs"], default="node")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--show-token", action="store_true", help="Explicitly display the local pairing token")
    args = parser.parse_args()
    if not args.extension_id and not args.firefox_origin:
        parser.error("Provide --extension-id or --firefox-origin")
    if not 1 <= args.port <= 65535:
        parser.error("Invalid port")
    directory = private_directory(args.state_dir.resolve())
    token_path = directory / "token.private.json"
    token = os.environ.get("BUTTERCUP_TOKEN")
    if not token:
        if token_path.exists():
            token = json.loads(token_path.read_text(encoding="utf-8"))["token"]
        else:
            token = secrets.token_urlsafe(32)
            private_write(token_path, json.dumps({"token": token}))
    settings = Settings(token=token, origins=tuple([*(f"chrome-extension://{x}" for x in args.extension_id), *args.firefox_origin]),
                        state_dir=directory, max_duration=args.max_duration, max_storage_mb=args.max_storage_mb,
                        concurrency=args.concurrency, js_runtime=args.js_runtime, ffmpeg=args.ffmpeg, ffprobe=args.ffprobe)
    print(f"Local pairing token stored in {token_path}")
    if args.show_token:
        print(f"Pairing token: {token}")
    import uvicorn
    uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
