#!/usr/bin/env bash
set -euo pipefail

msg="${1:-}"
if [[ -z "${msg}" ]]; then
  echo "Usage: ./deploy.sh \"chore: your message\""
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git not found"
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ -z "${branch}" ]]; then
  echo "Error: cannot detect git branch"
  exit 1
fi

git add .
git commit -m "${msg}" || true

echo "Pushing to origin/${branch} ..."
git push origin "${branch}"

cat <<'EOF'

Coolify 部署提示：
- 如果你在 Coolify 选择了 Dockerfile 构建：触发一次 Redeploy / Rebuild 即可。
- 如果你启用了 Auto Deploy：push 后会自动触发构建。

如果遇到 429/503：
- 这是上游限流/不可用，已在 /api/chat 透传为 429/503，并缩短超时与输出长度以改善“耗时很久”体感。
EOF

