#!/usr/bin/env bash
# Backward-compatible entry point; startup preserves the selected database.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun scripts/dev.ts "$@"
