#!/bin/bash
# Daily PostgreSQL backup script
# Add to crontab: 0 3 * * * /opt/naps/deploy/backup.sh

set -euo pipefail

BACKUP_DIR="/opt/naps/backups"
DB_NAME="naps"
KEEP_DAYS=30
TIMESTAMP=$(date +%Y-%m-%d_%H%M)

mkdir -p "$BACKUP_DIR"

# Dump and compress
pg_dump "$DB_NAME" | gzip > "$BACKUP_DIR/naps_${TIMESTAMP}.sql.gz"

# Remove backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "naps_*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "Backup complete: naps_${TIMESTAMP}.sql.gz"
