#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$project_root/.venv/bin/python" "$project_root/scripts/setup-assistant.py" --gui
