#!/bin/sh
set -e
DEST=${1:-./backups}
SRC=${DB_FILE:-./server/data/dac.db}
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"
sqlite3 "$SRC" ".backup '$DEST/dac-$TS.db'"
gzip "$DEST/dac-$TS.db"
find "$DEST" -name 'dac-*.db.gz' -mtime +30 -delete
echo "[backup] $DEST/dac-$TS.db.gz"
