import csv
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, urlsplit


VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def video_id(value: str) -> str:
    if VIDEO_ID.fullmatch(value):
        return value
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or parsed.username or parsed.password
                or parsed.port not in (None, 443)):
            raise ValueError
        host = parsed.hostname
        if host == "youtu.be":
            candidate = parsed.path.removeprefix("/")
        elif host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
            if parsed.path == "/watch":
                ids = parse_qs(parsed.query).get("v", [])
                candidate = ids[0] if len(ids) == 1 else ""
            elif re.fullmatch(r"/(shorts|embed|live)/[A-Za-z0-9_-]{11}", parsed.path):
                candidate = parsed.path.rsplit("/", 1)[1]
            else:
                raise ValueError
        else:
            raise ValueError
        if not VIDEO_ID.fullmatch(candidate):
            raise ValueError
        return candidate
    except (ValueError, TypeError):
        raise ValueError("Use an 11-character YouTube ID or a valid HTTPS YouTube URL") from None


SUBTITLE_NAME = re.compile(r'\[[A-Za-z0-9_-]{11}\](___[^<>:"/\\|?*\x00-\x1f]{1,150})?\.(srt|vtt)')


def subtitle_target(folder: str, filename: str) -> Path:
    # Only subtitle files named after a video, inside a folder the user typed.
    directory = Path(folder)
    if not directory.is_absolute() or not directory.is_dir():
        raise ValueError("The subtitle folder does not exist. Use the full path of an existing folder.")
    if not SUBTITLE_NAME.fullmatch(filename) or filename[:-4].endswith((" ", ".")):
        raise ValueError("Invalid subtitle file name")
    return directory / filename


def private_directory(path: Path) -> Path:
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink():
        raise RuntimeError("State directory must not be a symbolic link")
    if os.name == "nt":
        identity = subprocess.run(
            ["whoami", "/user", "/fo", "csv", "/nh"], capture_output=True,
            text=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW,
        )
        sid = next(csv.reader([identity.stdout.strip()]))[1]
        if not re.fullmatch(r"S-1-[0-9-]+", sid):
            raise RuntimeError("Cannot determine Windows user SID")
        subprocess.run(
            ["icacls", str(path), "/inheritance:r", "/grant:r",
             f"*{sid}:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"],
            capture_output=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW,
        )
    else:
        path.chmod(0o700)
    return path


def private_write(path: Path, content: str) -> None:
    # Windows inherits the user-only ACL of private_directory. POSIX uses mode 0600.
    if path.is_symlink():
        raise RuntimeError("Refusing a symbolic link for private data")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
    if os.name != "nt":
        path.chmod(0o600)
