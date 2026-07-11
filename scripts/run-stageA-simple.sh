#!/bin/zsh
# Simplify: run all 3 systems via the existing tsx script, with a wrapper
# that handles logging correctly.

cd /Users/qi/Desktop/项目/VerseCraft-playtest || exit 1
source .env.local 2>/dev/null

export LIVE_MAX_STEPS=${LIVE_MAX_STEPS:-100}
export VERSE_CRAFT_URL=${VERSE_CRAFT_URL:-http://localhost:666}

echo "$(date): Starting Stage A: weapon system..."
pnpm dlx tsx scripts/run-live-stageA-final.ts 2>&1 | tee /tmp/stageA-weapon-$(date +%s).log
echo "$(date): Weapon system finished"
