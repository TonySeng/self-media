# Self-Media 自媒体运营管理平台

个人自媒体运营管理平台。第一版支持抖音作品数据查看、AI 分析建议、统一素材管理。

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript（严格模式）
- Prisma + PostgreSQL 16
- Tailwind CSS + shadcn/ui
- Vitest 测试
- Docker 部署

## 项目结构

```
self-media/
├── prisma/                # Prisma schema 与迁移
├── src/
│   ├── app/               # Next.js App Router 页面与 API
│   ├── lib/               # 通用工具（crypto/auth/db/env/...）
│   └── components/        # UI 组件
├── tests/                 # Vitest 单元测试
├── scripts/               # 运维脚本
└── docs/superpowers/      # 设计文档与实施计划
```

## 快速开始

### 0. 前置依赖

- Node.js 20+
- pnpm 9+
- Docker / Docker Compose

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动数据库

```bash
docker compose up -d
```

### 3. 生成密钥与密码哈希

```bash
node scripts/gen-secrets.mjs "你的管理员密码"
```

把输出贴入 `.env`（先 `cp .env.example .env`）。脚本输出的 `ADMIN_PASSWORD_HASH` 已经做了 `\$` 转义，直接粘贴即可。

### 4. 应用数据库迁移

```bash
pnpm prisma migrate deploy
```

### 5. 启动开发服务器

```bash
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)，用刚才设置的管理员密码登录。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm test` | 运行测试 |
| `pnpm test:watch` | 测试 watch 模式 |
| `pnpm prisma studio` | 可视化 DB 工具 |
| `pnpm prisma migrate dev --name <n>` | 新建 + 应用迁移（开发） |
| `docker compose up -d` | 启动开发用 PostgreSQL |
| `docker compose down` | 停止 |

## 部署到腾讯云服务器

```bash
# 上传代码到服务器
rsync -avz --exclude node_modules --exclude .next --exclude data \
    ./ ubuntu@124.222.64.26:/srv/self-media/

ssh ubuntu@124.222.64.26
cd /srv/self-media

# 创建数据卷目录
sudo mkdir -p /var/self-media/{db,uploads,caddy_data,caddy_config}

# 在服务器上设置 .env（POSTGRES_PASSWORD/MASTER_KEY/ADMIN_PASSWORD_HASH/SESSION_SECRET）
cp .env.example .env
node scripts/gen-secrets.mjs "你的密码"   # 输出复制到 .env
nano .env

# 构建并启动
docker compose -f docker-compose.prod.yml up -d --build
```

## 文档

- [设计文档](./docs/superpowers/specs/2026-05-29-self-media-platform-design.md)
- [实施计划目录](./docs/superpowers/plans/)
