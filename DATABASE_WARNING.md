# ⚠️ 数据保护警告

**此项目包含用户生产数据！**

## 开发前必读

1. **数据库文件位置：** `prisma/dev.db` (35MB)
   - 包含：1 个抖音账号、56 条作品、2 个对标账号、LLM 配置
   - **此文件已纳入 Git 版本控制**（用于备份和恢复）

2. **禁止的操作：**
   ```bash
   # ❌ 永远不要运行这些命令
   prisma migrate reset           # 会清空所有数据
   prisma db push --force-reset   # 会清空所有数据
   rm prisma/dev.db              # 会删除数据库
   ```

3. **Schema 变更安全流程：**
   ```bash
   # ✅ 正确方式：使用迁移（保留数据）
   pnpm prisma migrate dev --name your_change
   
   # ✅ 开发模式（SQLite legacy）
   pnpm prisma db push
   # ⚠️ 此命令不会清空数据，但会提示冲突时需要手动处理
   ```

4. **备份方式：**
   ```bash
   # 方式 1：手动备份脚本
   bash scripts/backup-db.sh
   
   # 方式 2：提交到 Git
   git add prisma/dev.db
   git commit -m "backup: update database"
   ```

5. **数据恢复：**
   ```bash
   # 从 Git 恢复最新版本
   git show HEAD:prisma/dev.db > prisma/dev.db
   
   # 从手动备份恢复
   cp backups/manual/dev.db.YYYYMMDD-HHMMSS prisma/dev.db
   ```

## 给 AI 助手的指令

如果你是 AI 助手（如 Claude Code），在执行任何操作前：

1. **检查操作是否会影响数据库**
   - 涉及 `prisma migrate reset` / `db push --force-reset` → **必须先询问用户**
   - 涉及删除或覆盖 `prisma/dev.db` → **必须先备份**

2. **Schema 变更时**
   - 优先使用 `prisma migrate dev`（生成迁移文件）
   - 如果使用 `prisma db push`，**必须先提醒用户备份**
   - **永远不要**使用 `--force-reset` 或 `--accept-data-loss` 标志

3. **测试时**
   - 使用独立的测试数据库：`DATABASE_URL=file:./prisma/test.db`
   - **不要**让测试污染生产数据库

4. **发现数据丢失时**
   - **立即停止所有操作**
   - 尝试从 Git 恢复：`git show HEAD:prisma/dev.db`
   - 通知用户并提供恢复方案

## 紧急恢复指南

详见 `DATA_SAFETY.md` 文件。

---

**记住：数据无价，备份为王！**

最后更新：2026-06-07（数据恢复事件后）
