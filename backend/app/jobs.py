import asyncio
from dataclasses import dataclass, field
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

from .audio import prepare_audio
from .process import spawn, stop


@dataclass
class Job:
    id: str
    video: str
    directory: Path
    audio_track: str = 'default'
    audio_mode: str = 'chunks'
    state: str = "queued"
    progress: dict = field(default_factory=dict)
    chunks: list = field(default_factory=list)
    error: dict | None = None
    cancel: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task | None = None
    touched: float = field(default_factory=time.monotonic)
    uses_cookies: bool = False

    def public(self):
        return {"id": self.id, "video_id": self.video, "state": self.state,
                "progress": self.progress, "chunks": self.chunks, "error": self.error, "audio_track": self.audio_track,
                "audio_mode": self.audio_mode}


class Jobs:
    def __init__(self, settings, cookies):
        self.settings = settings
        self.cookies = cookies
        state = settings.state_dir.resolve()
        self.directory = state / "jobs"
        if self.directory.resolve().parent != state or self.directory.is_symlink():
            raise RuntimeError("Jobs directory must stay inside the private state directory")
        # Lifespan owns a single process; remove leftovers from an interrupted session.
        if self.directory.exists():
            shutil.rmtree(self.directory)
        self.directory.mkdir(mode=0o700)
        self.items = {}
        self.semaphore = asyncio.Semaphore(settings.concurrency)

    def guard(self):
        size = sum(path.stat().st_size for path in self.directory.rglob("*") if path.is_file())
        if size > self.settings.max_storage_mb * 1024 * 1024:
            raise ValueError("Backend storage limit reached; delete completed jobs or increase the limit")

    def create(self, video, chunk_seconds, max_upload, audio_track='default', audio_mode='chunks'):
        if len(self.items) >= self.settings.max_jobs:
            raise ValueError("Too many jobs; wait or delete existing jobs")
        self.guard()
        identifier = uuid.uuid4().hex
        directory = self.directory / identifier
        directory.mkdir(mode=0o700)
        job = Job(identifier, video, directory, audio_track=audio_track, audio_mode=audio_mode)
        self.items[identifier] = job
        # Capture explicitly imported cookies at submission; no cookies enter job metadata.
        cookiefile = self.cookies.snapshot(directory)
        job.uses_cookies = cookiefile is not None
        job.task = asyncio.create_task(self.execute(job, cookiefile, chunk_seconds, max_upload))
        return job

    async def execute(self, job, cookiefile, chunk_seconds, max_upload):
        try:
            async with self.semaphore:
                if job.cancel.is_set():
                    raise asyncio.CancelledError
                job.state = "extracting"
                result = await self.extract(job, cookiefile)
                if result.get("stage") == "error":
                    job.error = {k: result[k] for k in ("code", "message", "attempts") if k in result}
                    if result.get("code") == "authentication" and job.uses_cookies:
                        self.cookies.invalid = True
                    job.state = "error"
                    return
                source = Path(result["path"]).resolve()
                if job.audio_track == 'original' and result.get('audio_track') != 'original':
                    raise ValueError('Extractor did not confirm original audio selection.')
                if source.parent != job.directory.resolve() or not source.is_file():
                    raise ValueError("Extractor returned an invalid audio file")
                job.state = "converting"
                extra = {'mode': job.audio_mode} if job.audio_mode != 'chunks' else {}
                job.chunks = await prepare_audio(source, job.directory, self.settings, chunk_seconds,
                    max_upload, job.cancel, lambda value: setattr(job, "progress", value), self.guard, **extra)
                job.progress = {"stage": "ready", "extractor": result.get("extractor"), "attempts": result.get("attempts", [])}
                job.state = "ready"
        except asyncio.CancelledError:
            job.state = "cancelled"
        except (ValueError, RuntimeError, FileNotFoundError) as error:
            job.state = "error"
            # Only errors produced by our validation are surfaced. OS paths never leave the backend.
            message = str(error) if isinstance(error, (ValueError, RuntimeError)) else "Missing FFmpeg, FFprobe, or Python dependency"
            job.error = {"code": "processing", "message": message}
        except Exception:
            job.state = "error"
            job.error = {"code": "internal", "message": "Backend processing failed"}
        finally:
            if cookiefile:
                cookiefile.unlink(missing_ok=True)
            if job.state != "ready":
                shutil.rmtree(job.directory, ignore_errors=True)
            job.touched = time.monotonic()

    async def extract(self, job, cookiefile):
        process = spawn([sys.executable, "-m", "backend.app.extractors.worker"],
                        cwd=str(Path(__file__).resolve().parents[2]),
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        text=True, encoding="utf-8")
        payload = {"video": job.video, "directory": str(job.directory),
                   "cookiefile": str(cookiefile) if cookiefile else None,
                   "limits": {"max_bytes": self.settings.max_storage_mb * 1024 * 1024,
                              "max_duration": self.settings.max_duration, "js_runtime": self.settings.js_runtime,
                              "audio_track": job.audio_track}}
        process.stdin.write(json.dumps(payload) + "\n")
        process.stdin.close()
        last = {}
        async def read():
            nonlocal last
            while line := await asyncio.to_thread(process.stdout.readline):
                try:
                    data = json.loads(line)
                    if data.get("stage") in {"error", "extracted"}:
                        last = data
                    else:
                        job.progress = data
                except (ValueError, TypeError):
                    pass  # Ignore library stdout; never relay it to clients/logs.
        reader = asyncio.create_task(read())
        started = time.monotonic()
        try:
            while process.poll() is None:
                if job.cancel.is_set():
                    raise asyncio.CancelledError
                if time.monotonic() - started > self.settings.extraction_timeout:
                    raise RuntimeError("YouTube extraction timed out")
                self.guard()
                await asyncio.sleep(0.2)
            await reader
            if not last:
                raise RuntimeError("Extraction subprocess exited without a result")
            return last
        finally:
            stop(process)
            await reader
            process.stdout.close()

    async def delete(self, job):
        job.cancel.set()
        if job.task:
            # Cancelling also removes queued jobs without waiting on the semaphore.
            job.task.cancel()
            await asyncio.gather(job.task, return_exceptions=True)
        shutil.rmtree(job.directory, ignore_errors=True)
        self.items.pop(job.id, None)

    async def sweep(self):
        while True:
            await asyncio.sleep(30)
            for job in list(self.items.values()):
                if time.monotonic() - job.touched > self.settings.job_ttl:
                    await self.delete(job)

    async def close(self):
        for job in list(self.items.values()):
            await self.delete(job)
