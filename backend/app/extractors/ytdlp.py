from .manager import ExtractionError, classify_error


def original_audio(context):
    # yt-dlp sorts formats from worst to best and marks YouTube's original
    # language with preference 10 (the default/dubbed language uses 5).
    audio = [item for item in context.get('formats', [])
             if item.get('vcodec') == 'none' and item.get('acodec') not in (None, 'none')]
    for item in reversed(audio):
        if item.get('language_preference') == 10:
            yield item
            return
    # A video without dubs has a single, unmarked track: that track is the
    # original. A default (5) marker or a second language means dubs exist.
    if audio and len({item.get('language') for item in audio}) == 1             and not any(item.get('language_preference') == 5 for item in audio):
        yield audio[-1]
        return
    raise ExtractionError('audio_track', 'YouTube did not identify an available original audio track. No dubbed track was substituted.')


class QuietLogger:
    def debug(self, *args): pass
    def warning(self, *args): pass
    def error(self, *args): pass


class YtDlpExtractor:
    name = "yt-dlp"

    def extract(self, video, directory, cookiefile, limits, progress):
        from yt_dlp import YoutubeDL
        def hook(data):
            if data.get("status") == "downloading":
                downloaded = data.get("downloaded_bytes", 0)
                if downloaded > limits["max_bytes"]:
                    raise ExtractionError("storage", "Audio exceeds the configured storage limit.")
                total = data.get("total_bytes") or data.get("total_bytes_estimate")
                progress({"stage": "extracting", "downloaded_bytes": downloaded, "total_bytes": total})

        def duration_filter(info, *, incomplete=False):
            if info.get("is_live") or info.get("live_status") == "is_live":
                raise ExtractionError("live", "Live streams are unsupported.")
            if (info.get("duration") or 0) > limits["max_duration"]:
                raise ExtractionError("duration", "Video exceeds the configured duration limit.")
            return None

        options = {
            "format": original_audio if limits.get('audio_track') == 'original' else "bestaudio/best[acodec!=none][vcodec=none]",
            "outtmpl": str(directory / "source.%(ext)s"),
            "noplaylist": True, "quiet": True, "no_warnings": True,
            "logger": QuietLogger(), "progress_hooks": [hook],
            "match_filter": duration_filter, "max_filesize": limits["max_bytes"],
            "socket_timeout": 20, "retries": 2, "fragment_retries": 2,
            "cachedir": False, "js_runtimes": {limits["js_runtime"]: {}},
        }
        if cookiefile:
            options["cookiefile"] = str(cookiefile)
        try:
            with YoutubeDL(options) as downloader:
                info = downloader.extract_info(f"https://www.youtube.com/watch?v={video}", download=True)
                if not info or info.get("_type") == "playlist":
                    raise ExtractionError("duration", "Video exceeds duration limit or is a live stream.")
                from pathlib import Path
                path = Path(downloader.prepare_filename(info))
                if not path.is_file():
                    raise ExtractionError("storage", "Audio was not downloaded; check size limits.")
                return {"path": str(path), "duration": info.get("duration"),
                        "audio_track": limits.get('audio_track', 'default')}
        except ExtractionError:
            raise
        except Exception as error:
            raise classify_error(error) from None
