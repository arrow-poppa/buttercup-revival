import json
from pathlib import Path
import sys

from .manager import ExtractionError, ExtractionManager
from .pytubefix import PytubefixExtractor
from .ytdlp import YtDlpExtractor


def main():
    config = json.loads(sys.stdin.readline())
    def progress(data):
        print(json.dumps(data), flush=True)
    manager = ExtractionManager(YtDlpExtractor(), PytubefixExtractor())
    try:
        result = manager.extract(config["video"], Path(config["directory"]),
                                 config.get("cookiefile"), config["limits"], progress)
        progress({"stage": "extracted", **result})
    except ExtractionError as error:
        progress({"stage": "error", "code": error.code, "message": error.message, "attempts": manager.attempts})
        sys.exit(1)
    except Exception:
        progress({"stage": "error", "code": "internal", "message": "Extraction subprocess failed."})
        sys.exit(1)


if __name__ == "__main__":
    main()
