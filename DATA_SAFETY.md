# 数据安全指南

## ⚠️ 重要：防止数据丢失

本项目使用 SQLite 数据库存储用户数据（账号、作品、素材等）。为了防止数据丢失，请遵循以下规则：

### 1. 数据库文件位置

**正确的数据库文件：** `prisma/dev.db`

**环境变量配置：** `.env` 文件中必须配置正确的路径
```env
DATABASE_URL=file:./prisma/dev.db
```

### 2. 禁止的操作

❌ **禁止随意删除或覆盖 `prisma/dev.db` 文件**
❌ **禁止运行 `prisma migrate reset`（会清空所有数据）**
❌ **禁止运行 `prisma db push --force-reset`**
❌ **禁止在测试中使用生产数据库**

### 3. 数据备份策略

#### 方式 1：手动备份（推荐）
```bash
# 运行备份脚本
bash scripts/backup-db.sh

# 或者手动复制
cp prisma/dev.db "prisma/dev.db.backup-$(date +%Y%m%d)"
```

#### 方式 2：提交到 Git
```bash
git add prisma/dev.db
git commit -m "backup: update database"
git push
```

#### 方式 3：自动备份（可选）
- GitHub Actions 会每天自动备份数据库到 `backups/` 目录
- 配置文件：`.github/workflows/backup-db.yml`

### 4. 数据恢复

如果数据意外丢失，可以从以下位置恢复：

#### 从 Git 恢复
```bash
# 查看数据库的历史版本
git log --oneline prisma/dev.db

# 恢复到某个历史版本
git show <commit-hash>:prisma/dev.db > prisma/dev.db
```

#### 从备份文件恢复
```bash
# 从手动备份恢复
cp backups/manual/dev.db.YYYYMMDD-HHMMSS prisma/dev.db

# 从自动备份恢复
cp backups/dev.db.YYYYMMDD-HHMMSS prisma/dev.db
```

### 5. 开发流程规范

#### Schema 变更
```bash
# 1. 修改 schema.prisma
# 2. 生成迁移文件（不会丢失数据）
pnpm prisma migrate dev --name your_migration_name

# 3. 查看迁移 SQL 确认安全
cat prisma/migrations/*/migration.sql
```

#### 测试
```bash
# 使用测试专用数据库，不要污染开发数据库
DATABASE_URL=file:./prisma/test.db pnpm test
```

### 6. 紧急恢复检查清单

如果发现数据丢失：

1. ✅ **立即停止所有进程**
   ```bash
   # Windows
   taskkill /F /IM node.exe /IM electron.exe
   ```

2. ✅ **检查当前数据库文件**
   ```bash
   ls -lh prisma/dev.db
   # 如果文件很小（<1MB）说明数据已丢失
   ```

3. ✅ **尝试从 Git 恢复**
   ```bash
   git show HEAD:prisma/dev.db > /tmp/dev.db.from-git
   # 检查恢复的文件大小
   ls -lh /tmp/dev.db.from-git
   # 如果大小正常，替换当前文件
   cp /tmp/dev.db.from-git prisma/dev.db
   ```

4. ✅ **尝试从备份恢复**
   ```bash
   # 查找最新的备份
   ls -lht backups/
   # 恢复最新备份
   cp backups/dev.db.YYYYMMDD-HHMMSS prisma/dev.db
   ```

5. ✅ **验证数据**
   ```bash
   # 重启应用并检查数据是否恢复
   pnpm dev
   ```

### 7. 常见问题

**Q: 为什么 .env 中的 DATABASE_URL 很重要？**
A: 如果路径错误（如 `file:./dev.db` 而不是 `file:./prisma/dev.db`），应用会连接到错误的数据库文件，导致看不到数据。

**Q: 什么时候需要备份？**
A: 
- 每次添加/修改重要数据后
- 运行 schema 迁移前
- 升级依赖包前
- 部署到生产环境前

**Q: Git 中的数据库文件会很大吗？**
A: SQLite 是二进制文件，Git 每次都会存储完整快照。建议定期清理旧的提交，或使用 Git LFS。

**Q: 测试会影响生产数据吗？**
A: 不会。测试使用独立的测试数据库文件，不会触碰 `dev.db`。

### 8. 数据库健康检查

定期运行以下检查：

```bash
# 检查数据库文件大小
ls -lh prisma/dev.db

# 检查数据完整性
pnpm prisma db execute --stdin <<< "PRAGMA integrity_check;"

# 统计数据量
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  console.log('账号:', await prisma.platformAccount.count());
  console.log('作品:', await prisma.work.count());
  console.log('素材:', await prisma.material.count());
  await prisma.\$disconnect();
})();
"
```

---

## 📌 记住

**数据无价，备份为王！**

定期备份，永不后悔。
