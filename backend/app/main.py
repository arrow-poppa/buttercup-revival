import asyncio
import os
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
import re
import secrets
import shutil
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field

from .config import Settings
from .cookies import CookieStore
from .jobs import Jobs
from .security import private_directory, subtitle_target, video_id


class ImportCookies(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(max_length=1_048_576)
    persist: bool = False


class ToggleCookies(BaseModel):
    enabled: bool


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    video: str = Field(min_length=11, max_length=2048)
    audio_track: Literal['default', 'original'] = 'default'
    audio_mode: Literal['chunks', 'whole'] = 'chunks'
    audio_format: Literal['mp3', 'flac'] = 'mp3'
    chunk_seconds: int = Field(default=120, ge=5, le=1200)
    max_upload_bytes: int = Field(default=24_000_000, ge=100_000, le=100_000_000)


class SaveSubtitles(BaseModel):
    model_config = ConfigDict(extra="forbid")
    folder: str = Field(min_length=1, max_length=400)
    filename: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=1_000_000)


def dependency(name):
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def create_app(settings: Settings):
    @asynccontextmanager
    async def lifespan(app):
        private_directory(settings.state_dir)
        # Prevent a second server from deleting this instance's temporary jobs.
        from .lock import InstanceLock
        with InstanceLock(settings.state_dir / "backend.lock"):
            app.state.cookies = CookieStore(settings.state_dir)
            app.state.jobs = Jobs(settings, app.state.cookies)
            sweeper = asyncio.create_task(app.state.jobs.sweep())
            try:
                yield
            finally:
                sweeper.cancel()
                await asyncio.gather(sweeper, return_exceptions=True)
                await app.state.jobs.close()
                if not app.state.cookies.persistent:
                    app.state.cookies.remove()

    app = FastAPI(title="Buttercup Revival", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    class PairedCORSMiddleware(CORSMiddleware):
        def is_allowed_origin(self, origin):
            return settings.allows_origin(origin)

    app.add_middleware(PairedCORSMiddleware, allow_origins=list(settings.origins),
                       allow_methods=["GET", "POST", "DELETE", "PATCH"],
                       allow_headers=["Authorization", "Content-Type"], max_age=600)
    requests = {}

    @app.middleware("http")
    async def secure(request: Request, call_next):
        host = request.headers.get("host", "").split(":")[0]
        origin = request.headers.get("origin")
        if host != "127.0.0.1" or (origin is not None and not settings.allows_origin(origin)):
            return JSONResponse({"detail": "Host or origin denied"}, status_code=403)
        if request.method == "OPTIONS":
            return await call_next(request)
        provided = request.headers.get("authorization", "")
        if not secrets.compare_digest(provided, f"Bearer {settings.token}"):
            return JSONResponse({"detail": "Invalid local token"}, status_code=401)
        now = time.monotonic()
        bucket = int(now // 60)
        requests.clear() if requests and bucket not in requests else None
        requests[bucket] = requests.get(bucket, 0) + 1
        if requests[bucket] > 600:
            return JSONResponse({"detail": "Local request limit exceeded"}, status_code=429)
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)
        if length > 1_100_000:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
        # Bound even chunked bodies before Pydantic parses them.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1_100_000:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        return JSONResponse({"detail": "Internal backend error"}, status_code=500)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        # Pydantic's default response includes the input, which may contain cookie contents.
        return JSONResponse({"detail": "Invalid request fields"}, status_code=422)

    @app.get("/health")
    async def health():
        return {"status": "ok", "version": "0.2.0", "yt_dlp": dependency("yt-dlp"),
                "yt_dlp_ejs": dependency("yt-dlp-ejs"), "pytubefix": dependency("pytubefix"),
                "ffmpeg": bool(shutil.which(settings.ffmpeg)), "ffprobe": bool(shutil.which(settings.ffprobe)),
                "js_runtime": settings.js_runtime, "js_runtime_available": bool(shutil.which(settings.js_runtime)),
                "pytubefix_netscape_cookies": False, "audio_track_selection": ["default", "original"],
                "audio_modes": ["chunks", "whole"], "audio_formats": ["mp3", "flac"], "subtitle_save": True}

    async def stop_cookie_jobs():
        for job in list(app.state.jobs.items.values()):
            if job.uses_cookies and job.state in {"queued", "extracting", "converting"}:
                await app.state.jobs.delete(job)

    @app.post("/cookies/import")
    async def import_cookies(payload: ImportCookies):
        from .cookies import parse_netscape
        try:
            parse_netscape(payload.content)
            await stop_cookie_jobs()
            app.state.cookies.replace(payload.content, payload.persist)
            return app.state.cookies.status()
        except ValueError as error:
            raise HTTPException(400, str(error)) from None

    @app.get("/cookies/status")
    async def cookie_status():
        return app.state.cookies.status()

    @app.patch("/cookies")
    async def toggle_cookies(payload: ToggleCookies):
        if payload.enabled and not app.state.cookies.content:
            raise HTTPException(400, "Import cookies first")
        if not payload.enabled:
            await stop_cookie_jobs()
        app.state.cookies.enabled = payload.enabled
        return app.state.cookies.status()

    @app.delete("/cookies")
    async def remove_cookies():
        await stop_cookie_jobs()
        app.state.cookies.remove()
        return app.state.cookies.status()

    @app.post("/subtitles/save")
    async def save_subtitles(payload: SaveSubtitles):
        try:
            target = subtitle_target(payload.folder, payload.filename)
            partial = target.with_name(target.name + ".part")
            partial.write_bytes(payload.content.encode("utf-8"))
            os.replace(partial, target)
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        except OSError:
            raise HTTPException(400, "Could not write to the subtitle folder. Check that it is available and writable.") from None
        return {"path": str(target)}

    @app.post("/jobs/extract", status_code=202)
    async def extract(payload: ExtractRequest):
        try:
            video = video_id(payload.video)
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        try:
            return app.state.jobs.create(video, payload.chunk_seconds, payload.max_upload_bytes, payload.audio_track, payload.audio_mode, payload.audio_format).public()
        except ValueError as error:
            raise HTTPException(429, str(error)) from None

    def get_job(identifier):
        if not re.fullmatch(r"[0-9a-f]{32}", identifier) or identifier not in app.state.jobs.items:
            raise HTTPException(404, "Unknown job")
        job = app.state.jobs.items[identifier]
        job.touched = time.monotonic()
        return job

    @app.get("/jobs/{identifier}")
    async def status(identifier: str):
        return get_job(identifier).public()

    @app.get("/jobs/{identifier}/chunks/{index}")
    async def chunk(identifier: str, index: int):
        job = get_job(identifier)
        if job.state != "ready" or not 0 <= index < len(job.chunks):
            raise HTTPException(404, "Chunk unavailable")
        return FileResponse(job.directory / f"chunk-{index}.{job.audio_format}",
                            media_type="audio/flac" if job.audio_format == 'flac' else "audio/mpeg")

    @app.post("/jobs/{identifier}/cancel")
    async def cancel(identifier: str):
        job = get_job(identifier)
        await app.state.jobs.delete(job)
        return {"state": "cancelled"}

    @app.delete("/jobs/{identifier}")
    async def delete(identifier: str):
        await app.state.jobs.delete(get_job(identifier))
        return {"deleted": True}

    return app
