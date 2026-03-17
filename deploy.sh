#!/bin/bash
# 遇到错误即停止
set -e

echo "🚀 开始执行 VerseCraft 自动化部署..."

# 1. 提交到 Git (接收第一个参数作为 commit message，如果没有则使用默认)
COMMIT_MSG=${1:-"feat: 主页面UI重构"}
echo "📦 提交代码到 GitHub: $COMMIT_MSG"
git add .
git commit -m "$COMMIT_MSG" || true
git push origin main

# 2. Docker 部署流程
echo "🐳 开始清理旧 Docker 容器与镜像..."
docker rm -f versecraft-prod 2>/dev/null || true
# 强制删除旧镜像，忽略找不到镜像的错误
docker rmi -f $(docker images -q versecraft) 2>/dev/null || true

echo "🔨 开始构建新镜像 (No Cache)..."
BUILD_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/versecraft"
if [ -f .env.local ]; then
  BUILD_DATABASE_URL=$(grep -E "^DATABASE_URL=" .env.local | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
  [ -z "$BUILD_DATABASE_URL" ] && BUILD_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/versecraft"
fi
docker build --no-cache --build-arg DATABASE_URL="$BUILD_DATABASE_URL" -t versecraft:v1 .

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
