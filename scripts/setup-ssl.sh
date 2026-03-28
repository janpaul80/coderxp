#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-ssl.sh — CoderXP SSL/HTTPS setup (domain-agnostic)
#
# Run this ONCE on the production server as root or sudo.
#
# What it does:
#   1. Installs nginx (if not present)
#   2. Installs certbot + nginx plugin (if not present)
#   3. Creates /var/www/certbot for ACME challenges
#   4. Deploys the nginx config (HTTP-only first, for ACME challenge)
#   5. Obtains Let's Encrypt certificate for DOMAIN + www.DOMAIN
#   6. Deploys the full SSL nginx config (generated from app.conf.template)
#   7. Sets up auto-renewal via systemd timer (or cron fallback)
#   8. Verifies the setup
#
# Usage:
#   DOMAIN=yournewdomain.com ./scripts/setup-ssl.sh
#   # or:
#   DOMAIN=yournewdomain.com CERT_EMAIL=you@example.com ./scripts/setup-ssl.sh
#
# Required env vars:
#   DOMAIN        — apex domain, e.g. yournewdomain.com
#
# Optional env vars:
#   CERT_EMAIL    — email for Let's Encrypt expiry alerts (default: admin@DOMAIN)
#   SERVER_IP     — server IP for DNS check hint in output (default: 87.106.111.220)
#   WEBROOT       — frontend dist path (default: /var/www/coderxp/dist)
#
# Prerequisites:
#   - DNS: DOMAIN → SERVER_IP (A record must be live)
#   - DNS: www.DOMAIN → SERVER_IP (A record)
#   - Port 80 and 443 open in firewall
#   - Ubuntu 20.04+ or Debian 11+
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Config — all domain-specific values come from env ────────

DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
    echo "ERROR: DOMAIN env var is required."
    echo "Usage: DOMAIN=yournewdomain.com ./scripts/setup-ssl.sh"
    exit 1
fi

WWW_DOMAIN="www.${DOMAIN}"
CERT_EMAIL="${CERT_EMAIL:-admin@${DOMAIN}}"
SERVER_IP="${SERVER_IP:-87.106.111.220}"
WEBROOT="${WEBROOT:-/var/www/coderxp/dist}"
CERTBOT_WEBROOT="/var/www/certbot"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_TEMPLATE="$REPO_ROOT/nginx/app.conf.template"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"

# ─── Colour helpers ───────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section() { echo -e "\n${GREEN}══════════════════════════════════════════${NC}"; echo -e "${GREEN}  $*${NC}"; echo -e "${GREEN}══════════════════════════════════════════${NC}"; }

# ─── Root check ───────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Use: sudo DOMAIN=${DOMAIN} ./setup-ssl.sh"
fi

section "CoderXP SSL Setup — domain: ${DOMAIN}"
info "Apex domain:  ${DOMAIN}"
info "www domain:   ${WWW_DOMAIN}"
info "Cert email:   ${CERT_EMAIL}"
info "Webroot:      ${WEBROOT}"
info "Server IP:    ${SERVER_IP}"

# ─── Step 1: Install nginx ────────────────────────────────────

section "Step 1: Install nginx"

if command -v nginx &>/dev/null; then
    info "nginx already installed: $(nginx -v 2>&1)"
else
    info "Installing nginx..."
    apt-get update -qq
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    info "nginx installed and started"
fi

# ─── Step 2: Install certbot ──────────────────────────────────

section "Step 2: Install certbot"

if command -v certbot &>/dev/null; then
    info "certbot already installed: $(certbot --version 2>&1)"
else
    info "Installing certbot via snap..."
    if command -v snap &>/dev/null; then
        snap install --classic certbot
        ln -sf /snap/bin/certbot /usr/bin/certbot
    else
        # Fallback: apt install
        apt-get update -qq
        apt-get install -y certbot python3-certbot-nginx
    fi
    info "certbot installed"
fi

# ─── Step 3: Create required directories ─────────────────────

section "Step 3: Create directories"

mkdir -p "$WEBROOT"
mkdir -p "$CERTBOT_WEBROOT"
mkdir -p /var/log/nginx

# Placeholder index.html so nginx doesn't 404 before first deploy
if [[ ! -f "$WEBROOT/index.html" ]]; then
    cat > "$WEBROOT/index.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CoderXP — Coming Soon</title>
  <style>
    body { background: #0a0a0f; color: #e2e8f0; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    h1 { font-size: 2rem; font-weight: 700; }
    p  { color: #94a3b8; }
  </style>
</head>
<body>
  <div style="text-align:center">
    <h1>CoderXP</h1>
    <p>Deploying...</p>
  </div>
</body>
</html>
HTML
    info "Created placeholder index.html at $WEBROOT"
fi

# ─── Step 4: Deploy HTTP-only nginx config (for ACME challenge) ──

section "Step 4: Deploy initial nginx config (HTTP only)"

# Write a minimal HTTP-only config first so certbot can complete the challenge
cat > "$NGINX_SITES_AVAILABLE/$DOMAIN" <<NGINX_HTTP
# Temporary HTTP-only config for ACME challenge
# Will be replaced by full SSL config after certbot runs

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${CERTBOT_WEBROOT};
        allow all;
    }

    location / {
        root ${WEBROOT};
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX_HTTP

# Enable the site
if [[ ! -L "$NGINX_SITES_ENABLED/$DOMAIN" ]]; then
    ln -s "$NGINX_SITES_AVAILABLE/$DOMAIN" "$NGINX_SITES_ENABLED/$DOMAIN"
    info "Site enabled: $DOMAIN"
fi

# Remove default nginx site if it exists (conflicts on port 80)
if [[ -L "$NGINX_SITES_ENABLED/default" ]]; then
    rm "$NGINX_SITES_ENABLED/default"
    warn "Removed default nginx site (was conflicting on port 80)"
fi

# Test and reload nginx
nginx -t
systemctl reload nginx
info "nginx reloaded with HTTP-only config"

# ─── Step 5: Obtain Let's Encrypt certificate ─────────────────

section "Step 5: Obtain SSL certificate"

# Check if cert already exists
if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    warn "Certificate already exists for $DOMAIN — skipping certbot (run 'certbot renew' to renew)"
else
    info "Requesting certificate for $DOMAIN and $WWW_DOMAIN..."
    certbot certonly \
        --webroot \
        --webroot-path="$CERTBOT_WEBROOT" \
        --email "$CERT_EMAIL" \
        --agree-tos \
        --no-eff-email \
        --domains "$DOMAIN,$WWW_DOMAIN" \
        --non-interactive

    info "Certificate obtained successfully"
fi

# Verify cert files exist
[[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]] || error "Certificate not found after certbot run"
[[ -f "/etc/letsencrypt/live/$DOMAIN/privkey.pem"   ]] || error "Private key not found after certbot run"

# Ensure Certbot's recommended SSL options file exists
if [[ ! -f "/etc/letsencrypt/options-ssl-nginx.conf" ]]; then
    info "Downloading certbot SSL options..."
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
        -o /etc/letsencrypt/options-ssl-nginx.conf
fi

# Ensure DH params exist
if [[ ! -f "/etc/letsencrypt/ssl-dhparams.pem" ]]; then
    info "Generating DH parameters (this may take a minute)..."
    openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
fi

# ─── Step 6: Deploy full SSL nginx config from template ───────

section "Step 6: Deploy full SSL nginx config"

if [[ -f "$NGINX_TEMPLATE" ]]; then
    info "Generating nginx config from template: $NGINX_TEMPLATE"
    # Use envsubst to substitute DOMAIN and WEBROOT into the template
    # Only substitute these two variables — leave nginx $variables untouched
    DOMAIN="$DOMAIN" WEBROOT="$WEBROOT" \
        envsubst '${DOMAIN} ${WEBROOT}' < "$NGINX_TEMPLATE" \
        > "$NGINX_SITES_AVAILABLE/$DOMAIN"
    info "Deployed nginx config to $NGINX_SITES_AVAILABLE/$DOMAIN"
else
    warn "Template not found at $NGINX_TEMPLATE — writing inline SSL config..."

    cat > "$NGINX_SITES_AVAILABLE/$DOMAIN" <<NGINX_SSL
upstream coderxp_node {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${CERTBOT_WEBROOT};
        allow all;
    }

    location / {
        return 301 https://${DOMAIN}\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${WWW_DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://${DOMAIN}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options           "SAMEORIGIN"                                   always;
    add_header X-Content-Type-Options    "nosniff"                                      always;

    client_max_body_size 50m;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    proxy_http_version 1.1;
    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    location /socket.io/ {
        proxy_pass          http://coderxp_node;
        proxy_set_header    Upgrade    \$http_upgrade;
        proxy_set_header    Connection "upgrade";
        proxy_read_timeout  86400s;
        proxy_buffering     off;
    }

    location /api/ {
        proxy_pass         http://coderxp_node;
        proxy_read_timeout 300s;
    }

    location /uploads/ { proxy_pass http://coderxp_node; }
    location /internal/ { proxy_pass http://coderxp_node; proxy_read_timeout 300s; }
    location /health    { proxy_pass http://coderxp_node; access_log off; }

    root  ${WEBROOT};
    index index.html;

    location ~* \.(js|css|woff2?|ttf|eot|ico|png|jpg|jpeg|gif|svg|webp)$ {
        expires    1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files  \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
NGINX_SSL
fi

# Test and reload nginx with SSL config
nginx -t || error "nginx config test failed — check the config above"
systemctl reload nginx
info "nginx reloaded with full SSL config"

# ─── Step 7: Auto-renewal ─────────────────────────────────────

section "Step 7: Configure auto-renewal"

if systemctl is-active --quiet snap.certbot.renew.timer 2>/dev/null; then
    info "Certbot systemd timer already active (snap install)"
    systemctl status snap.certbot.renew.timer --no-pager | head -5

elif systemctl is-active --quiet certbot.timer 2>/dev/null; then
    info "Certbot systemd timer already active"
    systemctl status certbot.timer --no-pager | head -5

else
    warn "No certbot systemd timer found — installing cron job"
    CRON_JOB="0 3 * * * certbot renew --quiet --nginx --post-hook 'systemctl reload nginx'"
    (crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_JOB") | crontab -
    info "Cron job installed: $CRON_JOB"
fi

# Test renewal (dry run)
info "Testing renewal (dry run)..."
certbot renew --dry-run --quiet && info "Renewal dry run: OK" || warn "Renewal dry run failed — check certbot logs"

# ─── Step 8: Firewall — ensure ports 80 + 443 are open ───────

section "Step 8: Firewall check"

if command -v ufw &>/dev/null; then
    ufw allow 80/tcp  2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    ufw allow 'Nginx Full' 2>/dev/null || true
    info "ufw: ports 80 and 443 allowed"
    ufw status | grep -E "80|443|Nginx" || true
else
    warn "ufw not found — ensure ports 80 and 443 are open in your firewall/security group"
fi

# ─── Step 9: Verification ─────────────────────────────────────

section "Step 9: Verification"

info "Checking HTTPS response from https://${DOMAIN}/health ..."
sleep 2

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://${DOMAIN}/health" 2>/dev/null || echo "FAILED")
if [[ "$HTTP_STATUS" == "200" ]]; then
    info "✅ https://${DOMAIN}/health → HTTP $HTTP_STATUS"
else
    warn "⚠️  https://${DOMAIN}/health → HTTP $HTTP_STATUS (Node.js may not be running yet)"
fi

HTTP_REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -L "http://${DOMAIN}/" 2>/dev/null || echo "FAILED")
info "HTTP redirect check: http://${DOMAIN}/ → $HTTP_REDIRECT"

WWW_REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -L "https://${WWW_DOMAIN}/" 2>/dev/null || echo "FAILED")
info "www redirect check: https://${WWW_DOMAIN}/ → $WWW_REDIRECT"

CERT_EXPIRY=$(echo | openssl s_client -servername "${DOMAIN}" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep notAfter || echo "Could not check")
info "Certificate expiry: $CERT_EXPIRY"

# ─── Done ─────────────────────────────────────────────────────

section "SSL Setup Complete"

echo ""
echo -e "${GREEN}  ✅ HTTPS is live for ${DOMAIN}${NC}"
echo ""
echo "  Next steps:"
echo "  1. Deploy the frontend build:"
echo "     DOMAIN=${DOMAIN} ./scripts/deploy.sh  (from your local machine)"
echo ""
echo "  2. Update server .env.local:"
echo "     CLIENT_URL=https://${DOMAIN}"
echo "     CORS_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}"
echo ""
echo "  3. Restart the Node.js server:"
echo "     pm2 restart coderxp-server"
echo ""
echo "  4. Verify full stack:"
echo "     curl https://${DOMAIN}/health"
echo "     curl https://${DOMAIN}/api/providers/status"
echo ""
