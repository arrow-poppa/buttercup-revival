from dataclasses import dataclass, asdict
import json
import math
from pathlib import Path

from .process import run


@dataclass
class Chunk:
    index: int
    offset: float
    duration: float
    size: int = 0


def chunk_plan(duration: float, seconds: int, overlap: float = 1.5) -> list[Chunk]:
    if not math.isfinite(duration) or duration <= 0 or seconds <= overlap or overlap < 0:
        raise ValueError("Invalid audio duration/chunk size")
    result = []
    offset = 0.0
    while offset < duration:
        length = min(seconds, duration - offset)
        result.append(Chunk(len(result), offset, length))
        if offset + length >= duration:
            break
        offset += seconds - overlap
    return result


async def prepare_audio(source: Path, directory: Path, settings, seconds, max_upload, cancel, progress, guard, mode='chunks'):
    result = await run([settings.ffprobe, "-v", "error", "-show_entries", "format=duration",
                        "-of", "json", str(source)], cancel, guard=guard)
    try:
        duration = float(json.loads(result)["format"]["duration"])
    except (KeyError, ValueError):
        raise ValueError("FFprobe did not return an audio duration") from None
    if not math.isfinite(duration) or duration <= 0 or duration > settings.max_duration:
        raise ValueError("Audio exceeds the configured duration limit or is invalid")
    # 64 kbps mono MP3; retain headroom for metadata and multipart overhead.
    if mode == 'whole':
        if duration * 8000 > max_upload * .9:
            raise ValueError('The whole audio exceeds the selected upload limit. Choose Parts or increase the upload limit within your API limits. No audio was sent to the provider.')
        chunks = [Chunk(0, 0.0, duration)]
    elif mode == 'chunks':
        seconds = min(seconds, max(5, int(max_upload * 0.9 / 8000)))
        chunks = chunk_plan(duration, seconds)
    else:
        raise ValueError('Invalid audio sending mode')
    for chunk in chunks:
        if cancel.is_set():
            import asyncio
            raise asyncio.CancelledError
        progress({"stage": "converting", "progress": chunk.index / len(chunks)})
        target = directory / f"chunk-{chunk.index}.mp3"
        await run([settings.ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                   "-ss", str(chunk.offset), "-i", str(source), "-t", str(chunk.duration),
                   "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", str(target)],
                  cancel, timeout=max(120, chunk.duration * 2), guard=guard)
        chunk.size = target.stat().st_size
        if chunk.size > max_upload:
            raise ValueError("Converted audio exceeds the selected upload limit. Choose Parts or reduce chunk duration; no audio was sent to the provider.")
        guard()
    source.unlink(missing_ok=True)
    return [asdict(chunk) for chunk in chunks]
