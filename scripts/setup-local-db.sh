#!/usr/bin/env bash
# Backward-compatible entry point. No resets or automatic volume deletion.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun scripts/setup.ts database "$@"
