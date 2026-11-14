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


async def prepare_audio(source: Path, directory: Path, settings, seconds, max_upload, cancel, progress, guard, mode='chunks', audio_format='mp3'):
    if audio_format not in ('mp3', 'flac'):
        raise ValueError('Invalid audio format')
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
        if audio_format == 'mp3' and duration * 8000 > max_upload * .9:
            raise ValueError('The whole audio exceeds the selected upload limit. Choose Parts or increase the upload limit within your API limits. No audio was sent to the provider.')
        chunks = [Chunk(0, 0.0, duration)]
    elif mode == 'chunks':
        # FLAC is variable-rate. Start with a conservative 16-bit PCM estimate,
        # then enforce the actual encoded size before any provider upload.
        bytes_per_second = 32000 if audio_format == 'flac' else 8000
        seconds = min(seconds, max(5, int(max_upload * 0.9 / bytes_per_second)))
        chunks = chunk_plan(duration, seconds)
    else:
        raise ValueError('Invalid audio sending mode')
    index = 0
    while index < len(chunks):
        chunk = chunks[index]
        if cancel.is_set():
            import asyncio
            raise asyncio.CancelledError
        progress({"stage": "converting", "progress": chunk.index / len(chunks)})
        target = directory / f"chunk-{chunk.index}.{audio_format}"
        encoding = ['-c:a', 'flac', '-sample_fmt', 's16'] if audio_format == 'flac' else ['-c:a', 'libmp3lame', '-b:a', '64k']
        await run([settings.ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                   "-ss", str(chunk.offset), "-i", str(source), "-t", str(chunk.duration),
                   "-vn", "-ac", "1", "-ar", "16000", *encoding, str(target)],
                  cancel, timeout=max(120, chunk.duration * 2), guard=guard)
        chunk.size = target.stat().st_size
        if chunk.size > max_upload:
            target.unlink(missing_ok=True)
            if audio_format == 'flac' and mode == 'chunks':
                if chunk.duration <= 5:
                    raise ValueError('A five-second FLAC part exceeds the upload limit. Increase the limit within your API allowance or choose MP3; no audio was sent to the provider.')
                shorter = max(5, chunk.duration / 2)
                remaining = chunk_plan(duration - chunk.offset, shorter)
                for position, part in enumerate(remaining, start=index):
                    part.index = position
                    part.offset += chunk.offset
                chunks[index:] = remaining
                guard()
                continue
            raise ValueError("Converted audio exceeds the selected upload limit. Choose Parts or reduce chunk duration; no audio was sent to the provider.")
        guard()
        index += 1
    source.unlink(missing_ok=True)
    return [asdict(chunk) for chunk in chunks]
