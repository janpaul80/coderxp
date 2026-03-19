#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# server-setup.sh — One-time server bootstrap for coderxp.app
#
# Run as ROOT on the server (87.106.111.220) ONCE after SSL is set up.
#
# What it does:
#   1.  Installs Node.js 22 (via NodeSource)
#   2.  Installs pnpm (global)
#   3.  Installs pm2 (process manager)
#   4.  Installs Docker + Docker Compose plugin
#   5.  Creates /opt/coderxp app directory
#   6.  Writes docker-compose.yml for Postgres + Redis
#   7.  Starts Postgres + Redis containers
#   8.  Creates /opt/coderxp/.env.local template (YOU MUST FILL IN SECRETS)
#   9.  Waits for you to fill in secrets, then continues
#  10.  Installs Node dependencies (pnpm install)
#  11.  Runs Prisma migrations
#  12.  Starts the server with pm2
#  13.  Configures pm2 to auto-start on reboot
#
# Usage (on server as root):
#   chmod +x /root/server-setup.sh
#   /root/server-setup.sh
#
# After first run, use deploy.sh from your LOCAL machine for updates.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/opt/coderxp"
PM2_APP_NAME="coderxp-server"
NODE_VERSION="22"

# ─── Colour helpers ───────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}══════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════${NC}"; }

# ─── Must be root ─────────────────────────────────────────────

[[ "$EUID" -eq 0 ]] || error "This script must be run as root"

section "CoderXP Server Setup — $(date)"

# ─── Step 1: Node.js 22 ───────────────────────────────────────

section "Step 1: Install Node.js ${NODE_VERSION}"

if node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
    info "Node.js $(node --version) already installed"
else
    info "Installing Node.js ${NODE_VERSION} via NodeSource..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
    info "Node.js $(node --version) installed"
fi

# ─── Step 2: pnpm ─────────────────────────────────────────────

section "Step 2: Install pnpm"

if command -v pnpm &>/dev/null; then
    info "pnpm $(pnpm --version) already installed"
else
    info "Installing pnpm..."
    npm install -g pnpm
    info "pnpm $(pnpm --version) installed"
fi

# ─── Step 3: pm2 ──────────────────────────────────────────────

section "Step 3: Install pm2"

if command -v pm2 &>/dev/null; then
    info "pm2 $(pm2 --version) already installed"
else
    info "Installing pm2..."
    npm install -g pm2
    info "pm2 $(pm2 --version) installed"
fi

# ─── Step 4: Docker ───────────────────────────────────────────

section "Step 4: Install Docker + Docker Compose"

if command -v docker &>/dev/null; then
    info "Docker $(docker --version) already installed"
else
    info "Installing Docker..."
    apt-get update -qq
    apt-get install -y ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    info "Docker $(docker --version) installed"
fi

# ─── Step 5: Create app directory ─────────────────────────────

section "Step 5: Create app directory"

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/apps/server/uploads"
mkdir -p "$APP_DIR/apps/server/workspaces"
mkdir -p /var/www/coderxp/dist
info "App directory: $APP_DIR"
info "Static files:  /var/www/coderxp/dist"

# ─── Step 6: Write docker-compose.yml ─────────────────────────

section "Step 6: Write docker-compose.yml (Postgres + Redis)"

cat > "$APP_DIR/docker-compose.yml" <<'COMPOSE'
services:
  postgres:
    image: postgres:16-alpine
    container_name: codedxp_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: codedxp
      POSTGRES_PASSWORD: codedxp_secret
      POSTGRES_DB: codedxp_db
    ports:
      - '5433:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: codedxp_redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  postgres_data:
  redis_data:
COMPOSE

info "docker-compose.yml written to $APP_DIR"

# ─── Step 7: Start Postgres + Redis ───────────────────────────

section "Step 7: Start Postgres + Redis"

cd "$APP_DIR"

if docker ps --format '{{.Names}}' | grep -q codedxp_postgres; then
    info "codedxp_postgres already running"
else
    info "Starting Postgres + Redis..."
    docker compose up -d
fi

# Wait for Postgres to be ready
info "Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
    if docker exec codedxp_postgres pg_isready -U codedxp -d codedxp_db &>/dev/null; then
        info "Postgres is ready"
        break
    fi
    sleep 1
    if [[ $i -eq 30 ]]; then
        error "Postgres did not become ready in 30 seconds"
    fi
done

# ─── Step 8: Create .env.local template ───────────────────────

section "Step 8: Create .env.local template"

ENV_FILE="$APP_DIR/.env.local"

if [[ -f "$ENV_FILE" ]]; then
    info ".env.local already exists — skipping template creation"
    info "Current contents (secrets masked):"
    grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$' | sed 's/=.*/=***/' || true
else
    info "Creating .env.local template at $ENV_FILE ..."
    cat > "$ENV_FILE" <<'ENVTEMPLATE'
# ─────────────────────────────────────────────────────────────
# CoderXP Production Environment — /opt/coderxp/.env.local
#
# IMPORTANT: Fill in all values marked REQUIRED before starting
#            the server. Values are NEVER logged or persisted.
# ─────────────────────────────────────────────────────────────

# ── Database (Postgres via Docker on this server) ────────────
DATABASE_URL="postgresql://codedxp:codedxp_secret@localhost:5433/codedxp_db"

# ── Redis (via Docker on this server) ────────────────────────
REDIS_URL="redis://localhost:6379"

# ── JWT Secret — REQUIRED: generate with: openssl rand -hex 32
JWT_SECRET="REPLACE_WITH_STRONG_SECRET"

# ── Server ───────────────────────────────────────────────────
PORT=3001
NODE_ENV=production
CLIENT_URL="https://coderxp.app"
CORS_ORIGINS="https://coderxp.app,https://www.coderxp.app"

# ── AI Provider Keys (at least one required for builds) ──────

# BlackBox AI (primary provider)
# BLACKBOX_KEYS="key1,key2,key3"
# BLACKBOX_ENDPOINT="https://api.blackbox.ai/api/chat"
# BLACKBOX_MODEL="blackboxai/arcee-ai/trinity-large-preview:free"

# OpenRouter (alternative)
# OPEN_ROUTER_API_KEY="sk-or-..."

# Langdock (alternative)
# LANGDOCK_API_KEY="..."

# ── Planner provider (blackbox | openrouter | langdock) ──────
PLANNER_PROVIDER="blackbox"

# ── Dify AI Builders (Phase 8 Slice 2 — optional) ────────────
# DIFY_API_KEY="app-..."
# DIFY_BASE_URL="https://api.dify.ai/v1"
# DIFY_MOCK_MODE="false"
# DIFY_WORKFLOW_LANDING_PAGE=""
# DIFY_WORKFLOW_SAAS=""
# DIFY_WORKFLOW_STRIPE_AUTH_SUPABASE=""

# ── Worker relay (optional — for multi-worker setup) ─────────
# WORKER_PRIMARY_URL=""
# WORKER_INTERNAL_SECRET=""
ENVTEMPLATE

    warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    warn "  ACTION REQUIRED: Edit $ENV_FILE"
    warn "  Set JWT_SECRET and at least one AI provider key."
    warn "  Generate JWT_SECRET with: openssl rand -hex 32"
    warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Press ENTER after editing $ENV_FILE to continue..."
    read -r
fi

# Validate JWT_SECRET is set
JWT_VAL=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
if [[ -z "$JWT_VAL" || "$JWT_VAL" == "REPLACE_WITH_STRONG_SECRET" ]]; then
    error "JWT_SECRET is not set in $ENV_FILE — please set it and re-run"
fi
info "JWT_SECRET is set ✓"

# ─── Step 9: Check source code is present ─────────────────────

section "Step 9: Check source code"

if [[ ! -f "$APP_DIR/apps/server/package.json" ]]; then
    warn "Source code not found at $APP_DIR/apps/server/package.json"
    warn "You need to rsync the source from your local machine:"
    warn ""
    warn "  From your LOCAL machine, run:"
    warn "  rsync -avz --exclude node_modules --exclude .git --exclude dist \\"
    warn "    /path/to/codedxp/ root@87.106.111.220:/opt/coderxp/"
    warn ""
    warn "Then re-run this script or continue manually with steps 10-13."
    echo ""
    echo "  Press ENTER once source code is present, or Ctrl+C to exit..."
    read -r
fi

[[ -f "$APP_DIR/apps/server/package.json" ]] || error "Source code still not found — exiting"
info "Source code found ✓"

# ─── Step 10: Install dependencies ────────────────────────────

section "Step 10: Install Node.js dependencies"

cd "$APP_DIR"
info "Running pnpm install..."
pnpm install --frozen-lockfile 2>&1 | tail -10
info "Dependencies installed ✓"

# ─── Step 11: Run Prisma migrations ───────────────────────────

section "Step 11: Run Prisma migrations"

cd "$APP_DIR/apps/server"

# Load DATABASE_URL from .env.local for prisma
export $(grep '^DATABASE_URL=' "$APP_DIR/.env.local" | xargs)

info "Running prisma migrate deploy..."
npx prisma migrate deploy
info "Migrations complete ✓"

# Generate Prisma client
info "Generating Prisma client..."
npx prisma generate
info "Prisma client generated ✓"

# ─── Step 12: Start server with pm2 ───────────────────────────

section "Step 12: Start server with pm2"

cd "$APP_DIR/apps/server"

# Stop existing process if running
if pm2 list | grep -q "$PM2_APP_NAME"; then
    info "Stopping existing pm2 process..."
    pm2 stop "$PM2_APP_NAME" || true
    pm2 delete "$PM2_APP_NAME" || true
fi

info "Starting $PM2_APP_NAME with pm2..."
pm2 start npx \
    --name "$PM2_APP_NAME" \
    --cwd "$APP_DIR/apps/server" \
    --log "$APP_DIR/apps/server/server.log" \
    --error "$APP_DIR/apps/server/server-err.log" \
    --time \
    -- tsx src/index.ts

pm2 save
info "pm2 process started ✓"

# Wait for server to be ready
info "Waiting for server to be ready on port 3001..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:3001/health &>/dev/null; then
        info "Server is ready ✓"
        break
    fi
    sleep 1
    if [[ $i -eq 30 ]]; then
        warn "Server did not respond on port 3001 in 30 seconds"
        warn "Check logs: pm2 logs $PM2_APP_NAME"
    fi
done

# ─── Step 13: Configure pm2 startup ───────────────────────────

section "Step 13: Configure pm2 auto-start on reboot"

pm2 startup systemd -u root --hp /root | tail -1 | bash || true
pm2 save
info "pm2 startup configured ✓"

# ─── Done ─────────────────────────────────────────────────────

section "Server Setup Complete"

echo ""
echo -e "${GREEN}  ✅ CoderXP server setup complete${NC}"
echo ""
echo "  Status:"
pm2 list
echo ""
echo "  Health check:"
curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/health
echo ""
echo "  Next steps:"
echo "    1. From your LOCAL machine, run: ./scripts/deploy.sh"
echo "       (builds frontend + deploys to /var/www/coderxp/dist)"
echo "    2. Verify: https://coderxp.app"
echo ""
echo "  Useful commands:"
echo "    pm2 logs $PM2_APP_NAME          # view server logs"
echo "    pm2 restart $PM2_APP_NAME       # restart server"
echo "    pm2 status                       # process status"
echo "    docker compose -f $APP_DIR/docker-compose.yml ps  # DB/Redis status"
echo ""
