import asyncio
import shutil
import subprocess
import wave

import pytest
from backend.app.audio import chunk_plan, prepare_audio
from backend.app.config import Settings
from backend.app.process import run


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
