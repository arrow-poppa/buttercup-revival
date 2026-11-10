"""Optional REAL YouTube extraction smoke test. No provider key or cookies required.

Run from the repository root: python scripts/live-extraction.py --video jNQXAC9IVRw
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.process import spawn, stop


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', default='jNQXAC9IVRw')
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--chunk-seconds', type=int, default=60)
    parser.add_argument('--audio-mode', choices=['chunks', 'whole'], default='chunks')
    args = parser.parse_args()
    import httpx
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
    root = Path(__file__).resolve().parents[1]
    output = root / 'test-results'; output.mkdir(exist_ok=True)
    token = secrets.token_urlsafe(32)
    environment = {**os.environ, 'BUTTERCUP_TOKEN': token}
    with tempfile.TemporaryDirectory(prefix='buttercup live ') as directory:
        process = spawn([sys.executable, '-m', 'backend.app', '--extension-id', 'a' * 32,
                         '--port', str(port), '--state-dir', directory], cwd=root, env=environment,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        client = httpx.Client(base_url=f'http://127.0.0.1:{port}', headers={
            'Authorization': f'Bearer {token}', 'Origin': 'chrome-extension://' + 'a' * 32,
        }, timeout=20, trust_env=False)
        report = {'video': args.video, 'platform': sys.platform, 'real_youtube': True}
        identifier = None
        try:
            started = time.monotonic()
            while True:
                try:
                    health = client.get('/health'); health.raise_for_status(); break
                except httpx.HTTPError:
                    if time.monotonic() - started > 30: raise RuntimeError('Backend did not start')
                    time.sleep(.2)
            report['health'] = health.json()
            print(json.dumps({'health': report['health']}), flush=True)
            response = client.post('/jobs/extract', json={'video': args.video, 'chunk_seconds': args.chunk_seconds, 'audio_mode': args.audio_mode})
            response.raise_for_status(); identifier = response.json()['id']
            previous = None
            while True:
                response = client.get(f'/jobs/{identifier}'); response.raise_for_status(); job = response.json()
                state = (job['state'], job['progress'].get('stage'))
                if state != previous:
                    print(json.dumps({'state': job['state'], 'progress': job['progress']}), flush=True); previous = state
                if job['state'] in {'ready', 'error', 'cancelled'}: break
                if time.monotonic() - started > args.timeout: raise RuntimeError('Live extraction test timed out')
                time.sleep(1)
            report['job'] = job
            if job['state'] != 'ready': raise RuntimeError(job.get('error', {}).get('message', 'Extraction failed'))
            if args.audio_mode == 'whole':
                assert job['audio_mode'] == 'whole' and len(job['chunks']) == 1 and job['chunks'][0]['offset'] == 0
            chunk = client.get(f'/jobs/{identifier}/chunks/0'); chunk.raise_for_status()
            assert len(chunk.content) > 0 and chunk.headers['content-type'] == 'audio/mpeg'
            report['passed'] = True
            print('Real YouTube extraction and FFmpeg chunk download passed.', flush=True)
        except Exception as error:
            report['passed'] = False; report['error'] = str(error)
            print(str(error), flush=True)
        finally:
            if identifier:
                client.delete(f'/jobs/{identifier}')
            client.close(); stop(process)
            (output / ('live-extraction-whole.json' if args.audio_mode == 'whole' else 'live-extraction.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
        return 0 if report.get('passed') else 1


if __name__ == '__main__':
    raise SystemExit(main())
