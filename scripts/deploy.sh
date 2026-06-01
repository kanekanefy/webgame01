#!/usr/bin/env bash
# 一键部署到 Cloudflare（前端静态资产 + Worker + Durable Object）。
# 前置：已 `npx wrangler login`（或设置 CLOUDFLARE_API_TOKEN）。
# 用法：bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/4 校验 wrangler 鉴权"
npx wrangler whoami

echo "==> 2/4 构建前端"
pnpm build

echo "==> 3/4 部署 Worker + 静态资产 + DO"
npx wrangler deploy

echo "==> 4/4 注入生产 LLM 密钥（从 secrets/keys.env 读取）"
if [ -f secrets/keys.env ]; then
  # shellcheck disable=SC1091
  source secrets/keys.env
  if [ -n "${GENERALCOMPUTE_API_KEY:-}" ]; then
    printf '%s' "$GENERALCOMPUTE_API_KEY" | npx wrangler secret put LLM_API_KEY
    echo "✓ LLM_API_KEY 已注入（生产将走真 LLM）"
  else
    echo "⚠ 未找到 GENERALCOMPUTE_API_KEY，生产将用 MockProvider"
  fi
else
  echo "⚠ 无 secrets/keys.env，跳过密钥注入（生产用 MockProvider）"
fi

echo "✅ 部署完成。运行 'npx wrangler deployments list' 查看，或访问输出的 *.workers.dev URL。"
