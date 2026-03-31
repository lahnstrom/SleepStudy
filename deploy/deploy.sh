#!/bin/bash
# Deploy NAPS to production
# Run from the project root on the server: /opt/naps/deploy/deploy.sh

set -euo pipefail

PROJECT_DIR="/opt/naps"
CLIENT_DIR="/var/www/naps/client"

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
npx vite build

echo "=== Deploying frontend ==="
rm -rf "$CLIENT_DIR"/*
cp -r dist/* "$CLIENT_DIR/"

echo "=== Restarting services ==="
sudo systemctl restart naps
sudo systemctl reload caddy

echo "=== Deploy complete ==="
echo "Check status: systemctl status naps"
echo "Check logs:   journalctl -u naps -f"
