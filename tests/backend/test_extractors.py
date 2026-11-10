from pathlib import Path
import pytest

from backend.app.extractors.manager import ExtractionError, ExtractionManager, classify_error
from backend.app.extractors.pytubefix import PytubefixExtractor
from backend.app.extractors.ytdlp import original_audio
from types import SimpleNamespace


class Extractor:
    def __init__(self, name, error=None): self.name = name; self.error = error; self.calls = 0
    def extract(self, *args):
        self.calls += 1
        if self.error: raise self.error
        return {'path': 'audio.mp3'}


def test_primary_success():
    primary, secondary = Extractor('yt-dlp'), Extractor('pytubefix')
    result = ExtractionManager(primary, secondary).extract('abcdefghijk', Path('.'), None, {}, lambda _: None)
    assert result['extractor'] == 'yt-dlp' and not secondary.calls


def test_recoverable_fallback_keeps_reason():
    primary, secondary = Extractor('yt-dlp', classify_error(Exception('HTTP 403 private-secret'))), Extractor('pytubefix')
    result = ExtractionManager(primary, secondary).extract('abcdefghijk', Path('.'), None, {}, lambda _: None)
    assert result['extractor'] == 'pytubefix' and result['attempts'][0]['code'] == 'forbidden'
    assert 'private-secret' not in str(result)


@pytest.mark.parametrize('error', ['Sign in to confirm your age cookie=SECRET', 'HTTP 429', 'Video unavailable', 'not available in your country'])
def test_permanent_errors_do_not_fallback(error):
    primary, secondary = Extractor('yt-dlp', classify_error(Exception(error))), Extractor('pytubefix')
    with pytest.raises(ExtractionError): ExtractionManager(primary, secondary).extract('abcdefghijk', Path('.'), None, {}, lambda _: None)
    assert not secondary.calls


def test_cookie_fallback_not_faked():
    primary, secondary = Extractor('yt-dlp', classify_error(Exception('403'))), Extractor('pytubefix')
    with pytest.raises(ExtractionError): ExtractionManager(primary, secondary).extract('abcdefghijk', Path('.'), 'private.txt', {}, lambda _: None)
    assert not secondary.calls
    with pytest.raises(ExtractionError, match='cannot import Netscape'): PytubefixExtractor().extract('abcdefghijk', Path('.'), 'private.txt', {}, lambda _: None)


def test_original_audio_precedes_higher_quality_default_dub():
    low = dict(format_id='original-low', vcodec='none', acodec='opus', language_preference=10)
    best = {**low, 'format_id': 'original-best'}
    dub = {**best, 'format_id': 'dub', 'language_preference': 5}
    video = {**best, 'format_id': 'video', 'vcodec': 'avc1'}
    assert list(original_audio({'formats': [low, best, dub, video]})) == [best]


def test_original_selector_with_installed_ytdlp():
    from yt_dlp import YoutubeDL
    formats = [dict(format_id=name, url=f'https://example.com/{name}.m4a', ext='m4a',
                    vcodec='none', acodec='mp4a', abr=abr, language_preference=preference)
               for name, abr, preference in [('original-low', 64, 10), ('original-best', 128, 10), ('dub', 256, 5)]]
    with YoutubeDL({'format': original_audio, 'quiet': True}) as downloader:
        info = downloader.process_ie_result({'id': 'test', 'title': 'test', 'formats': formats}, download=False)
        assert info['format_id'] == 'original-best'
        with pytest.raises(ExtractionError, match='No dubbed track'):
            downloader.process_ie_result({'id': 'test', 'title': 'test', 'formats': formats[-1:]}, download=False)


def test_original_audio_uses_the_only_track_of_a_video_without_dubs():
    low = dict(format_id='low', vcodec='none', acodec='opus', language='ja', language_preference=-1)
    best = {**low, 'format_id': 'best'}
    assert list(original_audio({'formats': [low, best, {**best, 'vcodec': 'avc1'}]})) == [best]
    assert list(original_audio({'formats': [{'vcodec': 'none', 'acodec': 'opus'}]})) == [{'vcodec': 'none', 'acodec': 'opus'}]


@pytest.mark.parametrize('formats', [[],
    [{'vcodec': 'none', 'acodec': 'opus', 'language': 'en'}, {'vcodec': 'none', 'acodec': 'opus', 'language': 'pt'}],
    [{'vcodec': 'none', 'acodec': 'opus', 'language_preference': 5}],
    [{'vcodec': 'avc1', 'acodec': 'opus', 'language_preference': 10}]])
def test_original_audio_never_substitutes_unmarked_or_dubbed_track(formats):
    with pytest.raises(ExtractionError, match='No dubbed track') as caught:
        list(original_audio({'formats': formats}))
    assert caught.value.code == 'audio_track' and not caught.value.recoverable


def test_pytubefix_original_selection_excludes_dubs_and_accepts_single_track(monkeypatch, tmp_path):
    import pytubefix
    class Streams:
        def __init__(self, items): self.items = items
        def filter(self, only_audio=False, custom_filter_functions=()):
            return Streams([s for s in self.items if (not only_audio or not s.video)
                            and all(check(s) for check in custom_filter_functions)])
        def order_by(self, key): return Streams(sorted(self.items, key=lambda s: getattr(s, key)))
        def desc(self): return Streams(list(reversed(self.items)))
        def __iter__(self): return iter(self.items)
        def first(self): return next(iter(self.items), None)
    downloaded = []
    def stream(name, abr, multiple=True, original=False, video=False):
        return SimpleNamespace(abr=abr, includes_multiple_audio_tracks=multiple,
            is_default_audio_track=original, video=video, filesize=5, subtype='mp3',
            download=lambda **kwargs: downloaded.append(name) or str(tmp_path / 'source.mp3'))
    items = [stream('original-low', 64, original=True), stream('original-best', 128, original=True),
             stream('dub', 256), stream('unknown', 320, multiple=False, original=True),
             stream('video', 512, original=True, video=True)]
    monkeypatch.setattr(pytubefix, 'YouTube', lambda *a, **kw: SimpleNamespace(length=10, streams=Streams(items)))
    limits = dict(max_bytes=100, max_duration=20, audio_track='original')
    result = PytubefixExtractor().extract('abcdefghijk', tmp_path, None, limits, lambda _: None)
    assert downloaded == ['original-best'] and result['audio_track'] == 'original'
    items[:] = [stream('dub', 256)]
    with pytest.raises(ExtractionError, match='No dubbed track'):
        PytubefixExtractor().extract('abcdefghijk', tmp_path, None, limits, lambda _: None)
    assert downloaded == ['original-best']
    items[:] = [stream('only-low', 64, multiple=False), stream('only-best', 128, multiple=False)]
    PytubefixExtractor().extract('abcdefghijk', tmp_path, None, limits, lambda _: None)
    assert downloaded == ['original-best', 'only-best']
