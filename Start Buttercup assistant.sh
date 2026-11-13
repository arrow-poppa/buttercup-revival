#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
exec .venv/bin/python scripts/setup-assistant.py --start-service
