#!/bin/bash
# Run this on the server from /opt/naps: bash deploy/init-server.sh
set -euo pipefail

cd /opt/naps/server

# Generate secrets
SESSION_SECRET=$(openssl rand -hex 24)
DB_PASSWORD=$(openssl rand -hex 16)

# PostgreSQL setup with password
sudo -u postgres psql -c "DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naps') THEN
    CREATE ROLE naps WITH LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE naps WITH PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;"
sudo -u postgres createdb -O naps naps 2>/dev/null || true
echo "Database ready"

# Generate .env
cat > .env << ENVEOF
DATABASE_URL=postgresql://naps:${DB_PASSWORD}@localhost:5432/naps
SESSION_SECRET=${SESSION_SECRET}
CLIENT_URL=https://naps.metaresearch.se
PORT=3000
IMAGE_DIR=/opt/naps/server/images
NODE_ENV=production
ENVEOF
chmod 600 .env
echo "Created .env"

# Build server
npm ci
npx tsc
echo "Server built"

# Migrations + seed
npx tsx src/migrate.ts
psql "postgresql://naps:${DB_PASSWORD}@localhost:5432/naps" < /opt/naps/server/migrations/004_seed_input_config.sql
npx tsx src/seed.ts demoPassword123
echo "Migrations and seed complete"

# Placeholder images
npx tsx scripts/generate-placeholder-images.ts
echo "Placeholder images generated"

# Build client
cd /opt/naps/client
npm ci
echo "VITE_API_URL=https://naps.metaresearch.se/api" > .env
npx vite build
sudo mkdir -p /var/www/naps
sudo cp -r dist/* /var/www/naps/
echo "Client built and deployed"

# Nginx config
sudo tee /etc/nginx/sites-available/naps > /dev/null << 'NGINXEOF'
server {
    server_name naps.metaresearch.se;

    root /var/www/naps;
    index index.html;

    location /api/ {
        proxy_http_version 1.1;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://localhost:3000;
    }

    location / {
        try_files $uri /index.html;
    }

    listen 80;
    listen [::]:80;
}
NGINXEOF
sudo ln -sf /etc/nginx/sites-available/naps /etc/nginx/sites-enabled/naps
sudo nginx -t && sudo systemctl reload nginx
echo "Nginx configured"

# Systemd service
sudo tee /etc/systemd/system/naps.service > /dev/null << SVCEOF
[Unit]
Description=NAPS API Server
After=network.target postgresql.service

[Service]
Type=simple
User=${USER}
WorkingDirectory=/opt/naps/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/naps/server/.env

[Install]
WantedBy=multi-user.target
SVCEOF
sudo systemctl daemon-reload
sudo systemctl enable naps
sudo systemctl start naps
echo "NAPS service started"

# Check
sleep 2
curl -sf http://localhost:3000/api/health && echo " - API is healthy" || echo " - API failed to start, check: journalctl -u naps -n 20"

echo ""
echo "=== Done! ==="
echo "Run this to get HTTPS: sudo certbot --nginx -d naps.metaresearch.se"
echo "Login: admin@ki.se / demoPassword123"
echo "DB credentials are in /opt/naps/server/.env (chmod 600)"
