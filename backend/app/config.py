from dataclasses import dataclass, field
import os
from pathlib import Path


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

    def __post_init__(self):
        import re
        if len(self.token) < 32:
            raise ValueError("Use a local token with at least 32 characters")
        if not self.origins or any(not re.fullmatch(r"chrome-extension://[a-p]{32}", x) for x in self.origins):
            raise ValueError("Allow explicit Chrome extension IDs only")
        if not (1 <= self.concurrency <= 8 and self.max_jobs >= self.concurrency
                and self.max_duration > 0 and self.max_storage_mb >= 1 and self.job_ttl > 0):
            raise ValueError("Invalid backend resource limits")
