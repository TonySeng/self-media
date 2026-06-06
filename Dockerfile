# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ---- Deps ----
FROM base AS deps
# Alpine 上跑 Playwright 用系统 chromium 包（musl 兼容），跳过 npm 安装时下载默认浏览器（glibc 编译，alpine 跑不了）
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# 国内网络访问 registry.npmjs.org 易超时，build 阶段临时走 npmmirror（不写入 lockfile）
ENV npm_config_registry=https://registry.npmmirror.com
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM base AS build
ENV BUILD_STANDALONE=1
ENV npm_config_registry=https://registry.npmmirror.com
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ---- Runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# alpine CDN 国内访问慢，切到中科大镜像；chromium + Playwright 跑无头浏览器签名器需要的字体/共享库
RUN sed -i 's#dl-cdn.alpinelinux.org#mirrors.ustc.edu.cn#g' /etc/apk/repositories && \
    apk add --no-cache \
    openssl \
    su-exec \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk
# 让 Playwright 用系统 chromium，而不是去下载 glibc 版
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Install prisma CLI for `migrate deploy` at container start.
# Pinned to match the version in package.json (devDependency).
RUN npm install --global --no-fund --no-audit --registry=https://registry.npmmirror.com prisma@6.19.3

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
# Start as root to chown the volume-mounted upload dir, then drop to nextjs
CMD ["sh", "-c", "chown -R nextjs:nodejs /data/uploads && su-exec nextjs sh -c 'prisma migrate deploy && node server.js'"]
