import asyncio
import json
import random
import shutil
import subprocess
import wave

import pytest
from backend.app.audio import chunk_plan, prepare_audio
from backend.app.config import Settings
from backend.app.process import run


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='FFmpeg and FFprobe required')
@pytest.mark.parametrize('audio_format', ['mp3', 'flac'])
def test_real_audio_format_codec_rate_channels_and_chunk_timing(tmp_path, audio_format):
    source = tmp_path / 'original stereo.wav'
    with wave.open(str(source), 'wb') as output:
        output.setnchannels(2); output.setsampwidth(2); output.setframerate(48000)
        output.writeframes(random.Random(42).randbytes(48000 * 4 * 12))
    settings = Settings('t' * 32, ('chrome-extension://' + 'a' * 32,))
    chunks = asyncio.run(prepare_audio(source, tmp_path, settings, 5, 200000, asyncio.Event(), lambda _: None, lambda: None, audio_format=audio_format))
    assert [part['offset'] for part in chunks] == [0, 3.5, 7]
    assert chunks[-1]['offset'] + chunks[-1]['duration'] == 12
    for part in chunks:
        audio = tmp_path / f"chunk-{part['index']}.{audio_format}"
        stream = json.loads(subprocess.check_output([settings.ffprobe, '-v', 'error', '-show_streams', '-of', 'json', str(audio)]))['streams'][0]
        assert stream['codec_name'] == audio_format
        assert stream['sample_rate'] == '16000' and stream['channels'] == 1
        if audio_format == 'flac':
            assert stream['bits_per_raw_sample'] == '16'
            assert abs(float(stream['duration']) - part['duration']) < .001
        else:
            assert stream['bit_rate'] == '64000'
        assert 0 < part['size'] <= 200000
    assert not source.exists()


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='FFmpeg and FFprobe required')
def test_whole_flac_uses_actual_size_and_rejects_large_minimum_parts(tmp_path):
    settings = Settings('t' * 32, ('chrome-extension://' + 'a' * 32,))
    source = tmp_path / 'silence.wav'
    with wave.open(str(source), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
        output.writeframes(b'\0\0' * 16000 * 12)
    chunks = asyncio.run(prepare_audio(source, tmp_path, settings, 5, 20000, asyncio.Event(), lambda _: None, lambda: None, mode='whole', audio_format='flac'))
    assert len(chunks) == 1 and chunks[0]['duration'] == 12 and chunks[0]['size'] <= 20000
    source = tmp_path / 'noise.wav'
    with wave.open(str(source), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
        output.writeframes(random.Random(42).randbytes(32000 * 6))
    with pytest.raises(ValueError, match='Converted audio exceeds'):
        asyncio.run(prepare_audio(source, tmp_path, settings, 5, 100000, asyncio.Event(), lambda _: None, lambda: None, mode='whole', audio_format='flac'))
    assert not (tmp_path / 'chunk-0.flac').exists() and source.exists()
    with pytest.raises(ValueError, match='five-second FLAC'):
        asyncio.run(prepare_audio(source, tmp_path, settings, 5, 100000, asyncio.Event(), lambda _: None, lambda: None, audio_format='flac'))


def test_flac_size_retry_preserves_overlap_and_never_reencodes_completed_parts(tmp_path, monkeypatch):
    source = tmp_path / 'source.wav'; source.write_bytes(b'source')
    calls = []
    async def fake_run(command, *args, **kwargs):
        if command[0] == 'ffprobe':
            return '{"format":{"duration":23}}'
        offset, duration = float(command[command.index('-ss') + 1]), float(command[command.index('-t') + 1])
        calls.append((offset, duration))
        from pathlib import Path
        Path(command[-1]).write_bytes(b'x' * (1000001 if duration > 5 else 100))
    monkeypatch.setattr('backend.app.audio.run', fake_run)
    settings = Settings('t' * 32, ('chrome-extension://' + 'a' * 32,))
    chunks = asyncio.run(prepare_audio(source, tmp_path, settings, 10, 1000000, asyncio.Event(), lambda _: None, lambda: None, audio_format='flac'))
    assert calls[0] == (0, 10) and calls[1] == (0, 5)
    assert all(part['duration'] <= 5 and part['size'] == 100 for part in chunks)
    assert [part['index'] for part in chunks] == list(range(len(chunks)))
    for previous, current in zip(chunks, chunks[1:]):
        assert current['offset'] == previous['offset'] + previous['duration'] - 1.5
    assert chunks[-1]['offset'] + chunks[-1]['duration'] == 23


def test_flac_cancellation_stops_size_retries_and_preserves_the_source(tmp_path, monkeypatch):
    from pathlib import Path
    cancel = asyncio.Event()
    source = tmp_path / 'source.wav'; source.write_bytes(b'source')
    calls = []
    async def fake_run(command, *args, **kwargs):
        if command[0] == 'ffprobe':
            return '{"format":{"duration":20}}'
        calls.append(command)
        Path(command[-1]).write_bytes(b'x' * 1000001)
        cancel.set()
    monkeypatch.setattr('backend.app.audio.run', fake_run)
    settings = Settings('t' * 32, ('chrome-extension://' + 'a' * 32,))
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(prepare_audio(source, tmp_path, settings, 10, 1000000, cancel, lambda _: None, lambda: None, audio_format='flac'))
    assert len(calls) == 1 and source.exists() and not list(tmp_path.glob('chunk-*.flac'))


def test_chunk_offsets():
    chunks = chunk_plan(250, 120)
    assert [part.offset for part in chunks] == [0, 118.5, 237]
    assert chunks[-1].duration == 13
    assert len(chunk_plan(120, 120)) == 1
    with pytest.raises(ValueError): chunk_plan(float('nan'), 120)


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='FFmpeg and FFprobe required')
def test_real_ffmpeg_conversion_in_path_with_spaces(tmp_path):
    directory = tmp_path / 'audio com espaços'; directory.mkdir()
    source = directory / 'source.wav'
    with wave.open(str(source), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
        output.writeframes(b'\0\0' * 16000 * 12)
    settings = Settings('t' * 32, ('chrome-extension://' + 'a' * 32,))
    chunks = asyncio.run(prepare_audio(source, directory, settings, 5, 100000, asyncio.Event(), lambda _: None, lambda: None))
    assert len(chunks) == 3 and chunks[-1]['offset'] == 7
    assert all(0 < part['size'] <= 100000 for part in chunks)
    assert not source.exists()
    for part in chunks:
        assert (directory / f"chunk-{part['index']}.mp3").is_file()


def test_process_cancellation():
    import sys
    async def cancelled():
        event = asyncio.Event()
        task = asyncio.create_task(run([sys.executable, '-c', 'import time; time.sleep(60)'], event))
        await asyncio.sleep(.1); event.set()
        with pytest.raises(asyncio.CancelledError): await task
    asyncio.run(cancelled())


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='FFmpeg and FFprobe required')
def test_whole_audio_is_one_complete_file_and_oversize_stops_before_conversion(tmp_path):
    settings = Settings('t' * 32, ('chrome-extension://' + 'a' * 32,))
    def source_file(name):
        source = tmp_path / name
        with wave.open(str(source), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
            output.writeframes(b'\0\0' * 16000 * 12)
        return source
    source = source_file('whole.wav')
    chunks = asyncio.run(prepare_audio(source, tmp_path, settings, 5, 200000, asyncio.Event(), lambda _: None, lambda: None, mode='whole'))
    assert len(chunks) == 1 and chunks[0]['offset'] == 0 and chunks[0]['duration'] == 12
    assert chunks[0]['size'] <= 200000
    assert not source.exists()
    audio_duration = float(subprocess.check_output([settings.ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(tmp_path / 'chunk-0.mp3')]))
    assert 12 <= audio_duration < 12.2
    source = source_file('too-large.wav')
    with pytest.raises(ValueError, match='whole audio exceeds'):
        asyncio.run(prepare_audio(source, tmp_path, settings, 5, 10000, asyncio.Event(), lambda _: None, lambda: None, mode='whole'))
    assert source.exists()
