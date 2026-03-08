#!/usr/bin/env bash
# deploy.sh - Git commit + push, optionally trigger server deployment
# Usage: ./deploy.sh "feat: 更新说明"

set -e

MSG="${1:-chore: 自动部署}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo ">>> 添加变更..."
git add .
echo ">>> 提交: $MSG"
git commit -m "$MSG" || true
echo ">>> 推送到 GitHub..."
git push origin main

echo ""
echo "✅ 代码已推送到 GitHub main 分支。"
echo "📌 请在火山引擎服务器上执行以下命令完成部署："
echo "   cd /root/workspace/VerseCraft"
echo "   git pull origin main"
echo "   docker stop versecraft-prod 2>/dev/null; docker rm versecraft-prod 2>/dev/null"
echo "   docker build --no-cache -t versecraft:v1 ."
echo "   docker run -d --name versecraft-prod -p 3000:3000 -e HOSTNAME=\"0.0.0.0\" -e PORT=\"3000\" --env-file .env.local --restart unless-stopped versecraft:v1"
echo ""
