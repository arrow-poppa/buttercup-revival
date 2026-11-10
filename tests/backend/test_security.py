import time
import pytest

from backend.app.cookies import CookieStore, parse_netscape
from backend.app.security import private_directory, video_id
from backend.app.config import Settings

COOKIE = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSID\tTEST_ONLY\n"


@pytest.mark.parametrize("value", ["dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://youtube.com/live/dQw4w9WgXcQ"])
def test_video_ids(value):
    assert video_id(value) == "dQw4w9WgXcQ"


@pytest.mark.parametrize("value", ["../secrets", "file:///etc/passwd", "http://127.0.0.1/", "https://youtube.com.evil/watch?v=dQw4w9WgXcQ", "https://user@youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com:8080/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ&v=abcdefghijk", "https://youtu.be/dQw4w9WgXcQ/other", "https://youtube.com/playlist?list=x"])
def test_rejects_arbitrary_urls(value):
    with pytest.raises(ValueError): video_id(value)


def test_netscape_and_httponly():
    normalized, count, expired = parse_netscape(COOKIE.replace('.youtube.com', '#HttpOnly_.youtube.com'))
    assert count == 1 and not expired and '#HttpOnly_' in normalized


@pytest.mark.parametrize("content", ["bad cookie", COOKIE.replace('TRUE', 'yes', 1), COOKIE.replace('.youtube.com', '.evil.test'), COOKIE.replace('2147483647', '-1'), "# empty", COOKIE + '\0'])
def test_bad_cookies_do_not_echo_contents(content):
    with pytest.raises(ValueError) as error: parse_netscape(content)
    assert 'TEST_ONLY' not in str(error.value)


def test_expired_cookies():
    assert parse_netscape(COOKIE.replace('2147483647', str(int(time.time()) - 10)))[2]


def test_cookie_lifecycle(tmp_path):
    directory = private_directory(tmp_path / 'state with spaces')
    store = CookieStore(directory)
    store.replace(COOKIE)
    assert store.status()['imported'] and not store.path.exists()
    job = directory / 'job'; job.mkdir()
    snapshot = store.snapshot(job)
    assert snapshot.read_text() == COOKIE
    store.replace(COOKIE, persist=True)
    loaded = CookieStore(directory)
    assert loaded.status()['persistent']
    loaded.remove()
    assert not loaded.path.exists() and not loaded.status()['imported']
    snapshot.unlink()


def test_origin_config():
    with pytest.raises(ValueError): Settings('a' * 32, ('*',))
    with pytest.raises(ValueError): Settings('short', ('chrome-extension://' + 'a' * 32,))
