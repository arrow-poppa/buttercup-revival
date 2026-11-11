# Local backend

See the [main README](../README.md) for Windows/Linux installation and extension setup.

Run from the project root with Python 3.11+ and the dependencies installed:

```sh
python -m backend.app --extension-id YOUR_32_LETTER_EXTENSION_ID --show-token
```

The CLI binds only to `127.0.0.1`; there is no need to run `uvicorn` manually or expose a public endpoint. Supply a token through `BUTTERCUP_TOKEN`, or let the service generate one in its private state directory. Never put tokens in URLs.

Every route, including `/health`, requires `Authorization: Bearer TOKEN`. Request origins must be explicitly allowed. Requests without an Origin header (such as local CLI clients) still require the token and a loopback Host header. CORS does not accept wildcards. The backend never receives transcription provider keys.

| Method | Route | Behavior |
|---|---|---|
| GET | `/health` | Dependency versions and availability |
| POST | `/cookies/import` | JSON `{content,persist:false}`; validates and replaces cookies |
| GET | `/cookies/status` | Status without cookie values |
| PATCH | `/cookies` | JSON `{enabled:true}` |
| DELETE | `/cookies` | Cancels authenticated extractions and removes cookies |
| POST | `/jobs/extract` | JSON `{video,chunk_seconds:120,max_upload_bytes:24000000,audio_track:"default"}`; `audio_track` also accepts `"original"` |
| GET | `/jobs/{id}` | Progress, sanitized errors and chunk metadata |
| GET | `/jobs/{id}/chunks/{index}` | Authenticated local MP3 |
| POST | `/jobs/{id}/cancel` | Cancels and removes a job and its files |
| DELETE | `/jobs/{id}` | Removes a job and its files |

Subprocesses use argument lists without a shell. Windows uses Job Objects to terminate descendants and ACLs to protect state; Unix uses process groups and POSIX permissions. File paths use `pathlib`, with no Unix-only paths or tools in the shared workflow.

`/health` advertises `audio_track_selection: ["default", "original"]`. In original mode, yt-dlp selects the best audio-only format marked as original (`language_preference=10`); pytubefix filters streams by explicit original-track metadata. Missing identification causes an error instead of falling back to a dub or an unidentified track. The job confirms `audio_track`, and the backend checks the extractor's confirmation before conversion.

Use `python -m backend.app --help` for port, state, limits, JavaScript runtime and FFmpeg/FFprobe executable options.

`POST /jobs/extract` also accepts `audio_mode: "whole"` (default: `"chunks"`). Whole mode produces one MP3 with zero offset and the full duration. If its estimated size exceeds the selected upload safety margin, it fails before conversion/upload; the final size is checked too. Whole mode never silently splits audio. `/health` advertises `audio_modes`, and the job returns `audio_mode` for the extension to verify. The backend only prepares audio; the extension limits concurrent provider requests and keeps API keys out of the backend.
