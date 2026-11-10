from .manager import ExtractionError, classify_error


def is_original(stream):
    # pytubefix derives this flag from audioTrack.displayName's original marker.
    # Without audioTrack metadata its default flag only means audio-only.
    return stream.includes_multiple_audio_tracks and stream.is_default_audio_track


class PytubefixExtractor:
    name = "pytubefix"

    def extract(self, video, directory, cookiefile, limits, progress):
        if cookiefile:
            raise ExtractionError("cookies_unsupported", "pytubefix cannot import Netscape cookies; authenticated extraction requires yt-dlp.")
        from pytubefix import YouTube
        def hook(stream, chunk, remaining):
            downloaded = stream.filesize - remaining
            if downloaded > limits["max_bytes"]:
                raise ExtractionError("storage", "Audio exceeds the configured storage limit.")
            progress({"stage": "extracting", "downloaded_bytes": downloaded, "total_bytes": stream.filesize})
        try:
            youtube = YouTube(f"https://www.youtube.com/watch?v={video}",
                              on_progress_callback=hook, use_oauth=False, allow_oauth_cache=False)
            if youtube.length > limits["max_duration"]:
                raise ExtractionError("duration", "Video exceeds the configured duration limit.")
            streams = youtube.streams.filter(only_audio=True)
            # A video without dubs has one unmarked track, which is the original.
            if limits.get('audio_track') == 'original' and any(item.includes_multiple_audio_tracks for item in streams):
                streams = streams.filter(custom_filter_functions=[is_original])
            stream = streams.order_by("abr").desc().first()
            if not stream:
                if limits.get('audio_track') == 'original':
                    raise ExtractionError('audio_track', 'YouTube did not identify an available original audio track. No dubbed track was substituted.')
                raise ExtractionError("format", "No audio-only stream found.")
            if stream.filesize > limits["max_bytes"]:
                raise ExtractionError("storage", "Audio exceeds the configured storage limit.")
            path = stream.download(output_path=str(directory), filename=f"source.{stream.subtype}", timeout=20, max_retries=2)
            return {"path": path, "duration": youtube.length, "audio_track": limits.get('audio_track', 'default')}
        except ExtractionError:
            raise
        except Exception as error:
            raise classify_error(error) from None
