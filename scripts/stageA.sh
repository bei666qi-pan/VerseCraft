#!/usr/bin/env bash
# Stage A wrapper - clean launch
set -euo pipefail

cd /Users/qi/Desktop/项目/VerseCraft-playtest

export LIVE_MAX_STEPS=200
export VERSE_CRAFT_URL=http://localhost:666

LOG=/tmp/stageA-run.log

# tee both to log and stdout
npx tsx scripts/run-live-stageA-final.ts 2>&1 | tee "$LOG"
