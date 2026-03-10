#!/bin/bash
# 遇到错误即停止
set -e

echo "🚀 开始执行 VerseCraft 自动化部署..."

# 1. 提交到 Git (接收第一个参数作为 commit message，如果没有则使用默认)
COMMIT_MSG=${1:-"feat: 世界观锚点锁死、反死循环机制、CI/CD 部署脚本"}
echo "📦 提交代码到 GitHub: $COMMIT_MSG"
git add .
git commit -m "$COMMIT_MSG" || true
git push origin main

# 2. Docker 部署流程
echo "🐳 开始清理旧 Docker 容器与镜像..."
docker stop versecraft-prod || true
docker rm versecraft-prod || true
# 强制删除旧镜像，忽略找不到镜像的错误
docker rmi -f $(docker images -q versecraft) 2>/dev/null || true

echo "🔨 开始构建新镜像 (No Cache)..."
docker build --no-cache -t versecraft:v1 .

echo "🚢 启动新容器..."
docker run -d \
  --name versecraft-prod \
  -p 3000:3000 \
  -e HOSTNAME="0.0.0.0" \
  -e PORT="3000" \
  --env-file .env.local \
  --restart unless-stopped \
  versecraft:v1

echo "✅ 部署完成！VerseCraft 已在 http://localhost:3000 运行。"
