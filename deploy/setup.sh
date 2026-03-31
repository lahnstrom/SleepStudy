#!/bin/bash
# Initial server setup for KI IaaS Ubuntu VM
# Run as root on a fresh machine

set -euo pipefail

echo "=== NAPS Server Setup ==="

# 1. System packages
apt-get update
apt-get install -y curl git postgresql postgresql-contrib

# 2. Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# 3. Caddy
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# 4. Create naps user and directories
useradd --system --create-home --shell /bin/bash naps || true
mkdir -p /opt/naps /var/www/naps/client /opt/naps/backups
chown -R naps:naps /opt/naps /var/www/naps

# 5. PostgreSQL: create database and user
sudo -u postgres createuser naps 2>/dev/null || true
sudo -u postgres createdb -O naps naps 2>/dev/null || true

# 6. Copy systemd service
cp /opt/naps/deploy/naps.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable naps

# 7. Copy Caddyfile
cp /opt/naps/deploy/Caddyfile /etc/caddy/Caddyfile

# 8. Setup backup cron
cp /opt/naps/deploy/backup.sh /opt/naps/backup.sh
chmod +x /opt/naps/backup.sh
echo "0 3 * * * naps /opt/naps/backup.sh" > /etc/cron.d/naps-backup

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit /etc/caddy/Caddyfile — replace naps.example.com with your domain"
echo "  2. Edit /opt/naps/server/.env — set DATABASE_URL, SESSION_SECRET, CLIENT_URL, IMAGE_DIR"
echo "  3. Run: /opt/naps/deploy/deploy.sh"
echo "  4. Request KI firewall opening for ports 80 and 443"
