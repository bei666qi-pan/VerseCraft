#!/usr/bin/env bash
# Robust Stage A launcher - survives shell cleanup
set -uo pipefail

cd /Users/qi/Desktop/项目/VerseCraft-playtest

export LIVE_MAX_STEPS=${1:-200}
export VERSE_CRAFT_URL=http://localhost:666

LOG="/tmp/stageA-robust-$(date +%s).log"
PIDFILE="/tmp/stageA-robust.pid"

echo "Starting Stage A at $(date)" | tee "$LOG"
echo "MAX_STEPS=$LIVE_MAX_STEPS" | tee -a "$LOG"
echo "PID=$$" | tee -a "$LOG"

# Use exec to make the script replace its own process
exec pnpm dlx tsx scripts/run-live-stageA-final.ts >> "$LOG" 2>&1
