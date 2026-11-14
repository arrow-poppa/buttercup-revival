import asyncio
import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from tests.backend.test_security import COOKIE

TOKEN = 'test-pairing-token-' + 'x' * 32
ORIGIN = 'chrome-extension://' + 'a' * 32


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(TOKEN, (ORIGIN,), state_dir=tmp_path / 'state'))
    with TestClient(app, base_url='http://127.0.0.1:8767', headers={'Authorization': f'Bearer {TOKEN}', 'Origin': ORIGIN}) as client:
        yield client


def test_health_auth_origin_and_host(client):
    assert client.get('/health').status_code == 200
    assert client.get('/health').json()['audio_track_selection'] == ['default', 'original']
    assert client.get('/health').json()['audio_modes'] == ['chunks', 'whole']
    assert client.get('/health').json()['audio_formats'] == ['mp3', 'flac']
    assert client.get('/health').json()['subtitle_save'] is True
    assert client.get('/health', headers={'Authorization': ''}).status_code == 401
    assert client.get('/health', headers={'Origin': 'https://www.youtube.com'}).status_code == 403
    assert client.get('/health', headers={'Host': 'evil.example'}).status_code == 403
    assert client.options('/health', headers={'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization'}).status_code == 200


def test_subtitles_are_saved_only_as_named_files_in_an_existing_folder(client, tmp_path):
    folder = tmp_path / 'Subtitles'; folder.mkdir()
    name = '[abcdefghijk]___Olá 日本語 - title.srt'
    saved = client.post('/subtitles/save', json={'folder': str(folder), 'filename': name, 'content': '1\n'})
    assert saved.status_code == 200 and saved.json()['path'] == str(folder / name)
    assert (folder / name).read_bytes() == b'1\n' and not list(folder.glob('*.part'))
    assert client.post('/subtitles/save', json={'folder': str(folder), 'filename': name, 'content': '2\n'}).status_code == 200
    assert (folder / name).read_bytes() == b'2\n'
    assert client.post('/subtitles/save', json={'folder': str(folder), 'filename': '[abcdefghijk].vtt', 'content': 'x'}).status_code == 200
    for bad in ['abcdefghijk.srt', '[abcdefghijk]___a.txt', '[abcdefghijk]___..\\x.srt', '[abcdefghijk]___a/b.srt', '..\\[abcdefghijk].srt', '[abcdefghijk]___a .srt']:
        assert client.post('/subtitles/save', json={'folder': str(folder), 'filename': bad, 'content': 'x'}).status_code == 400, bad
    for bad in [str(tmp_path / 'missing'), 'relative', '']:
        assert client.post('/subtitles/save', json={'folder': bad, 'filename': name, 'content': 'x'}).status_code in (400, 422), bad
    assert sorted(item.name for item in folder.iterdir()) == ['[abcdefghijk].vtt', name]


def test_cookie_import_disable_remove(client):
    assert not client.get('/cookies/status').json()['imported']
    result = client.post('/cookies/import', json={'content': COOKIE})
    assert result.status_code == 200 and result.json()['enabled']
    assert 'TEST_ONLY' not in result.text
    assert not client.patch('/cookies', json={'enabled': False}).json()['enabled']
    assert not client.delete('/cookies').json()['imported']
    assert client.patch('/cookies', json={'enabled': True}).status_code == 400


def test_validation_does_not_echo_secrets(client):
    response = client.post('/cookies/import', json={'content': COOKIE, 'unexpected': 'SECRET'})
    assert response.status_code == 422 and 'TEST_ONLY' not in response.text and 'SECRET' not in response.text
    assert client.post('/cookies/import', json={'content': 'SECRET'}).status_code == 400
    assert client.post('/jobs/extract', json={'video': 'http://127.0.0.1/secret'}).status_code == 400
    assert client.post('/jobs/extract', json={'video': 'abcdefghijk', 'audio_track': 'dub'}).status_code == 422
    assert client.post('/jobs/extract', json={'video': 'abcdefghijk', 'audio_mode': 'unknown'}).status_code == 422


def test_whole_mode_reaches_the_audio_preparer_and_is_confirmed(client, monkeypatch):
    from backend.app.jobs import Jobs
    async def fake_extract(self, job, cookiefile):
        source = job.directory / 'whole.wav'; source.write_bytes(b'audio')
        return {'path': str(source)}
    async def fake_prepare(*args, **kwargs):
        assert kwargs == {'mode': 'whole'}
        return [{'index': 0, 'offset': 0, 'duration': 509, 'size': 4072000}]
    monkeypatch.setattr(Jobs, 'extract', fake_extract)
    monkeypatch.setattr('backend.app.jobs.prepare_audio', fake_prepare)
    response = client.post('/jobs/extract', json={'video': 'abcdefghijk', 'audio_mode': 'whole'})
    assert response.status_code == 202 and response.json()['audio_mode'] == 'whole'
    for _ in range(50):
        status = client.get('/jobs/' + response.json()['id']).json()
        if status['state'] in ('ready', 'error'): break
    assert status['state'] == 'ready' and status['audio_mode'] == 'whole' and len(status['chunks']) == 1


@pytest.mark.parametrize('confirmed', [True, False])
def test_original_job_requires_extractor_confirmation(client, monkeypatch, confirmed):
    from backend.app.jobs import Jobs
    async def fake_extract(self, job, cookiefile):
        assert job.audio_track == 'original'
        source = job.directory / 'source.mp3'
        source.write_bytes(b'audio')
        return {'path': str(source), 'audio_track': 'original' if confirmed else 'default'}
    async def fake_prepare(*args): return []
    monkeypatch.setattr(Jobs, 'extract', fake_extract)
    monkeypatch.setattr('backend.app.jobs.prepare_audio', fake_prepare)
    response = client.post('/jobs/extract', json={'video': 'abcdefghijk', 'audio_track': 'original'})
    assert response.status_code == 202 and response.json()['audio_track'] == 'original'
    for _ in range(50):
        status = client.get('/jobs/' + response.json()['id']).json()
        if status['state'] in ('ready', 'error'): break
    assert status['state'] == ('ready' if confirmed else 'error')
    if not confirmed: assert 'did not confirm' in status['error']['message']


@pytest.mark.parametrize('audio_format', ['mp3', 'flac'])
def test_job_lifecycle_and_cleanup(client, monkeypatch, audio_format):
    from backend.app.jobs import Jobs
    async def fake_extract(self, job, cookiefile):
        (job.directory / 'source.wav').write_bytes(b'audio')
        return {'stage': 'extracted', 'path': str(job.directory / 'source.wav'), 'extractor': 'mock'}
    async def fake_prepare(source, directory, *args, **kwargs):
        assert kwargs.get('audio_format', 'mp3') == audio_format
        (directory / f'chunk-0.{audio_format}').write_bytes(b'mock audio')
        source.unlink()
        return [{'index': 0, 'offset': 0, 'duration': 5, 'size': 8}]
    monkeypatch.setattr(Jobs, 'extract', fake_extract)
    monkeypatch.setattr('backend.app.jobs.prepare_audio', fake_prepare)
    response = client.post('/jobs/extract', json={'video': 'abcdefghijk', **({'audio_format': 'flac'} if audio_format == 'flac' else {})})
    assert response.status_code == 202
    assert response.json()['audio_format'] == audio_format
    identifier = response.json()['id']
    for _ in range(50):
        status = client.get(f'/jobs/{identifier}').json()
        if status['state'] == 'ready': break
    assert status['state'] == 'ready'
    audio = client.get(f'/jobs/{identifier}/chunks/0')
    assert audio.content == b'mock audio'
    assert audio.headers['content-type'] == ('audio/flac' if audio_format == 'flac' else 'audio/mpeg')
    assert client.get(f'/jobs/{identifier}/chunks/-1').status_code == 404
    assert client.delete(f'/jobs/{identifier}').status_code == 200
    assert client.get(f'/jobs/{identifier}').status_code == 404


@pytest.mark.parametrize('audio_format', ['wav', '../flac', '', None])
def test_unknown_audio_formats_are_rejected_before_extraction(client, audio_format):
    assert client.post('/jobs/extract', json={'video': 'abcdefghijk', 'audio_format': audio_format}).status_code == 422
    assert not client.app.state.jobs.items


def test_cancel_removes_cookie_snapshots(client, monkeypatch):
    from backend.app.jobs import Jobs
    async def wait(self, job, cookiefile):
        await asyncio.sleep(60)
    monkeypatch.setattr(Jobs, 'extract', wait)
    client.post('/cookies/import', json={'content': COOKIE})
    identifier = client.post('/jobs/extract', json={'video': 'abcdefghijk'}).json()['id']
    assert client.delete('/cookies').status_code == 200
    assert client.get(f'/jobs/{identifier}').status_code == 404
    assert not list(client.app.state.jobs.directory.rglob('*cookies*'))
