#!/bin/bash
# 手动备份数据库脚本
# 使用方法: bash scripts/backup-db.sh

set -e

BACKUP_DIR="backups/manual"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DB_FILE="prisma/dev.db"

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "$BACKUP_DIR/dev.db.$TIMESTAMP"
  echo "✓ Database backed up to: $BACKUP_DIR/dev.db.$TIMESTAMP"

  # 显示备份文件大小
  ls -lh "$BACKUP_DIR/dev.db.$TIMESTAMP"

  # 提示用户是否提交到 git
  echo ""
  echo "如果需要提交备份到 Git，请运行:"
  echo "git add $BACKUP_DIR/dev.db.$TIMESTAMP"
  echo "git commit -m 'backup: manual database backup'"
else
  echo "✗ Database file not found: $DB_FILE"
  exit 1
fi
