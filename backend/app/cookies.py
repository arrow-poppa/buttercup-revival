from datetime import datetime, timezone
import math
from pathlib import Path
import time

from .security import private_write


def parse_netscape(content: str) -> tuple[str, int, bool]:
    if len(content.encode("utf-8")) > 1_048_576 or "\0" in content:
        raise ValueError("Cookie file is invalid or exceeds 1 MiB")
    rows = []
    expired = 0
    for line in content.lstrip("\ufeff").splitlines():
        if not line.strip() or (line.startswith("#") and not line.startswith("#HttpOnly_")):
            continue
        fields = line.removeprefix("#HttpOnly_").split("\t")
        if len(fields) != 7:
            raise ValueError("Expected seven tab-separated Netscape cookie fields")
        domain, subdomains, path, secure, expires, name, value = fields
        host = domain.lstrip(".").lower()
        if not (host in {"youtube.com", "google.com"} or host.endswith(".youtube.com") or host.endswith(".google.com")):
            raise ValueError("Import only YouTube/Google cookies")
        if subdomains not in {"TRUE", "FALSE"} or secure not in {"TRUE", "FALSE"} or not path.startswith("/") or not name:
            raise ValueError("Invalid Netscape cookie fields")
        try:
            expiry = int(expires)
            if expiry < 0 or not math.isfinite(float(expiry)):
                raise ValueError
        except (ValueError, OverflowError):
            raise ValueError("Invalid cookie expiry") from None
        expired += int(0 < expiry < time.time())
        rows.append(line)
    if not rows:
        raise ValueError("No YouTube cookies found")
    return "# Netscape HTTP Cookie File\n" + "\n".join(rows) + "\n", len(rows), expired == len(rows)


class CookieStore:
    def __init__(self, directory: Path):
        self.path = directory / "cookies.private.txt"
        self.content = None
        self.enabled = False
        self.imported_at = None
        self.persistent = False
        self.invalid = False
        if self.path.exists():
            imported = self.path.stat().st_mtime
            self.replace(self.path.read_text(encoding="utf-8"), persist=True)
            self.imported_at = datetime.fromtimestamp(imported, timezone.utc).isoformat()

    def replace(self, content: str, persist: bool = False):
        normalized, _, expired = parse_netscape(content)
        self.remove()
        self.content = normalized
        self.enabled = True
        self.imported_at = datetime.now(timezone.utc).isoformat()
        self.persistent = persist
        self.invalid = expired
        if persist:
            private_write(self.path, normalized)

    def remove(self):
        self.path.unlink(missing_ok=True)
        self.content = None
        self.enabled = False
        self.imported_at = None
        self.persistent = False
        self.invalid = False

    def status(self):
        return {"imported": self.content is not None, "enabled": self.enabled,
                "imported_at": self.imported_at, "persistent": self.persistent,
                "possibly_expired": self.invalid}

    def snapshot(self, directory: Path) -> Path | None:
        if not self.enabled or not self.content:
            return None
        path = directory / "cookies.private.txt"
        private_write(path, self.content)
        return path
