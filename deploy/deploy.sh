#!/bin/bash
# Deploy NAPS to production
# Run from the project root on the server: /opt/naps/deploy/deploy.sh

set -euo pipefail

PROJECT_DIR="/opt/naps"
CLIENT_DIR="/var/www/naps"

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

echo "=== Seeding real neutral images ==="
cd "$PROJECT_DIR/server"
if [ -d "$PROJECT_DIR/Neutrala" ]; then
  echo "Copying Neutrala images to server images directory..."
  mkdir -p images
  cp -n "$PROJECT_DIR/Neutrala/"* images/
  echo "Running neutral image seed..."
  npx tsx scripts/seed-neutral-images.ts
else
  echo "Neutrala/ not found, skipping image seed"
fi

echo "=== Restarting services ==="
sudo systemctl restart naps
sudo systemctl reload nginx

echo "=== Deploy complete ==="
echo "Check status: systemctl status naps"
echo "Check logs:   journalctl -u naps -f"
