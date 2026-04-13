#!/bin/bash
# Deploy NAPS to production
# Run from the project root LOCALLY: bash deploy/deploy.sh
#
# This script:
#   1. Syncs stimulus images (gitignored) to the server
#   2. SSHs into the server to pull, build, migrate, seed, and restart

set -euo pipefail

SERVER="root@164.92.210.200"
PROJECT_DIR="/opt/naps"
CLIENT_DIR="/var/www/naps"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- Local steps ---

echo "=== Syncing stimulus images to server ==="
if [ -d "$LOCAL_DIR/Neutrala" ]; then
  rsync -az --info=progress2 "$LOCAL_DIR/Neutrala/" "$SERVER:$PROJECT_DIR/Neutrala/"
  echo "Neutral images synced"
else
  echo "WARNING: Neutrala/ not found locally, skipping image sync"
fi

# --- Remote steps ---

echo "=== Running remote deploy ==="
ssh "$SERVER" bash -s "$PROJECT_DIR" "$CLIENT_DIR" << 'REMOTE'
set -euo pipefail
PROJECT_DIR="$1"
CLIENT_DIR="$2"

cd "$PROJECT_DIR"

echo "=== Pulling latest code ==="
git pull

echo "=== Building server ==="
cd "$PROJECT_DIR/server"
npm ci --production=false
npx tsc

echo "=== Running migrations ==="
npx tsx src/migrate.ts

echo "=== Building client ==="
cd "$PROJECT_DIR/client"
npm ci

# Pre-flight check: warn if dev tools are enabled
if grep -q 'VITE_SHOW_DEV_TOOLS=1' .env 2>/dev/null; then
  echo ""
  echo "  *** WARNING: VITE_SHOW_DEV_TOOLS=1 is set ***"
  echo "  *** Dev tools (skip practice, etc.) will be visible to users ***"
  echo "  *** Set to 0 in client/.env before deploying to production ***"
  echo ""
fi

npx vite build

echo "=== Deploying frontend ==="
rm -rf "$CLIENT_DIR"/*
cp -r dist/* "$CLIENT_DIR/"

echo "=== Syncing stimulus images into serving directory ==="
cd "$PROJECT_DIR/server"
if [ -d "$PROJECT_DIR/Neutrala" ]; then
  mkdir -p images
  cp -n "$PROJECT_DIR/Neutrala/"* images/
  echo "Running neutral image seed..."
  npx tsx scripts/seed-neutral-images.ts
else
  echo "Neutrala/ not found on server, skipping image seed"
fi

echo "=== Restarting services ==="
systemctl restart naps
systemctl reload nginx

echo "=== Deploy complete ==="
echo "Check status: systemctl status naps"
echo "Check logs:   journalctl -u naps -f"
REMOTE
