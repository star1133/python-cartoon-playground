#!/bin/bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
mkdir -p .runtime
exec 8>.runtime/service.lock
flock -n 8 || exit 0
export HOSTNAME=127.0.0.1 PORT=3100
exec python3 scripts/serve.py
