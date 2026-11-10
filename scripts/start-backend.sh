#!/usr/bin/env sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
backend_python="$project_root/.venv/bin/python"
if [ ! -x "$backend_python" ]; then
    echo 'Create .venv and install backend/requirements.txt first. See README.md.' >&2
    exit 1
fi
if [ "$#" -lt 1 ]; then
    echo 'Usage: sh scripts/start-backend.sh EXTENSION_ID [--port 8767] [--show-token]' >&2
    exit 1
fi
extension_id=$1
shift
cd "$project_root"
exec "$backend_python" -m backend.app --extension-id "$extension_id" "$@"
