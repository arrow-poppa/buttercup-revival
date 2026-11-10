import asyncio
import os
import signal
import subprocess


def spawn(args, **kwargs):
    options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
    process = subprocess.Popen(args, **options, **kwargs)
    if os.name == "nt":
        from .windows_job import ProcessTree
        try:
            process._buttercup_tree = ProcessTree(process)
        except OSError:
            process.kill()
            process.wait()
            raise RuntimeError("Cannot create a protected Windows process tree") from None
    return process


def stop(process):
    if os.name == "nt" and hasattr(process, '_buttercup_tree'):
        process._buttercup_tree.stop()
        process.wait(timeout=10)
        return
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait(timeout=10)


async def run(args, cancel, timeout=120, guard=lambda: None):
    process = spawn(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    # communicate drains the pipe concurrently to avoid deadlock with large ffprobe output.
    reader = asyncio.create_task(asyncio.to_thread(process.communicate))
    started = asyncio.get_running_loop().time()
    try:
        while not reader.done():
            if cancel.is_set():
                raise asyncio.CancelledError
            if asyncio.get_running_loop().time() - started > timeout:
                raise RuntimeError("Media processing timed out")
            guard()
            await asyncio.sleep(0.15)
        stdout, _ = await reader
        if process.returncode:
            raise RuntimeError("Media processing failed; check FFmpeg/FFprobe installation")
        return stdout
    finally:
        stop(process)
        await reader
