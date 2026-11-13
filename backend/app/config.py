from dataclasses import dataclass, field
import json
import re
import os
from pathlib import Path


GECKO_ORIGIN = re.compile(r"moz-extension://([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
GECKO_ID = re.compile(r"[A-Za-z0-9._@{}-]{1,200}")


def state_directory() -> Path:
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "ButtercupRevival"
    return Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "buttercup-revival"


@dataclass
class Settings:
    token: str
    origins: tuple[str, ...]
    state_dir: Path = field(default_factory=state_directory)
    max_duration: int = 14400
    max_storage_mb: int = 1024
    concurrency: int = 2
    max_jobs: int = 12
    job_ttl: int = 1800
    extraction_timeout: int = 600
    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"
    js_runtime: str = "node"
    gecko_ids: tuple[str, ...] = ()

    def __post_init__(self):
        if len(self.token) < 32:
            raise ValueError("Use a local token with at least 32 characters")
        if not (self.origins or self.gecko_ids) or any(not (re.fullmatch(r"chrome-extension://[a-p]{32}", x) or GECKO_ORIGIN.fullmatch(x)) for x in self.origins):
            raise ValueError("Allow explicit Chromium extension origins or Firefox profile origins only")
        if any(not isinstance(item, str) or not GECKO_ID.fullmatch(item) for item in self.gecko_ids):
            raise ValueError("Invalid Gecko extension ID")
        if not (1 <= self.concurrency <= 8 and self.max_jobs >= self.concurrency
                and self.max_duration > 0 and self.max_storage_mb >= 1 and self.job_ttl > 0):
            raise ValueError("Invalid backend resource limits")

    def allows_origin(self, origin: str) -> bool:
        if origin in self.origins:
            return True
        match = GECKO_ORIGIN.fullmatch(origin)
        if not match or not self.gecko_ids:
            return False
        # Firefox UUIDs belong to profiles, not to the stable add-on ID. Only the
        # native bridge or explicit local setup can bind one. Read on demand so pairing a
        # second browser never interrupts existing Chromium/Firefox jobs.
        path = self.state_dir / 'gecko-origins' / (match[1] + '.json')
        try:
            if path.is_symlink() or path.stat().st_size > 1024:
                return False
            value = json.loads(path.read_text(encoding='utf-8'))
            return isinstance(value, dict) and value.get('extension_id') in self.gecko_ids
        except (OSError, ValueError):
            return False
