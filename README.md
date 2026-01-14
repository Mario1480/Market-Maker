# uLiquid Market-Maker

Webbasierter Crypto Market-Maker mit Market-Making-Strategien, Volume-Bot, Multi-CEX-Support und SaaS-Vorbereitung.

---

## Features

- Market Making (Bids/Asks, Spread, Levels)
- Inventory Skew (Skew Factor, Max Skew)
- Jitter (Preis-Randomisierung)
- Volume Bot (fill-basiert, echte Trades)
- Multi-CEX Architektur (Bitmart integriert)
- Web UI (Next.js)
- API (Node.js + Express + Prisma)
- Runner Service (Trading Loops)
- PostgreSQL
- Docker / Docker Compose
- HTTPS via Caddy
- User / Login / Workspace
- SaaS-ready Architektur

---

## Architektur Überblick

┌─────────────┐      HTTPS       ┌─────────────┐
│   Browser   │ ───────────────▶ │   Caddy     │
└─────────────┘                  └──────┬──────┘
│
┌────────────────────────┼────────────────────────┐
│                        │                        │
┌───────▼───────┐       ┌────────▼────────┐       ┌───────▼───────┐
│   Web (3000)  │       │   API (8080)     │       │ Runner (Bot)  │
│ Next.js       │       │ Express + Prisma │       │ Trading Loops │
└───────────────┘       └────────┬────────┘       └───────────────┘
│
┌───────▼───────┐
│ PostgreSQL    │
└───────────────┘

---

## Voraussetzungen

- Ubuntu 22.04 LTS VPS
- Docker & Docker Compose
- Domain + DNS:
  - `test.example.com` → VPS IP
  - `api.test.example.com` → VPS IP
- Offene Ports:
  - `80/tcp`
  - `443/tcp`
  - `22/tcp` (SSH)

---

## Installation (VPS – empfohlen)

### 1) Docker installieren

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

➡️ Neue Shell öffnen oder neu einloggen.

⸻

2) Projekt deployen

sudo mkdir -p /opt/market-maker
sudo chown -R $USER:$USER /opt/market-maker
cd /opt/market-maker
git clone <REPO_URL> .


⸻

3) Environment erstellen

nano .env

NODE_ENV=development

# ===== Database =====
DATABASE_URL=postgresql://mm:mm@postgres:5432/marketmaker

# ===== Admin Seed =====
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CHANGE_ME
ADMIN_WORKSPACE_NAME=Main

# ===== API URLs =====
# Browser → API (öffentlich)
NEXT_PUBLIC_API_URL=https://api.test.example.com
# Container intern → API
API_BASE_URL=http://api:8080

# ===== Cookies / Auth =====
COOKIE_DOMAIN=.example.com
COOKIE_SECURE=true

# ===== CORS =====
CORS_ORIGINS=https://test.example.com,http://localhost:3000

# ===== Exchange =====
BITMART_BASE_URL=https://api-cloud.bitmart.com


⸻

4) Caddy (HTTPS) installieren

sudo snap install caddy
sudo snap start --enable caddy.server

Caddyfile:

sudo nano /var/snap/caddy/common/Caddyfile

test.example.com {
  reverse_proxy 127.0.0.1:3000
}

api.test.example.com {
  reverse_proxy 127.0.0.1:8080
}

Caddyfile aktivieren:

sudo caddy adapt \
  --config /var/snap/caddy/common/Caddyfile \
  --adapter caddyfile \
  --pretty > /var/snap/caddy/common/caddy.json

sudo snap restart caddy.server

Test:

curl -I https://test.example.com
curl -i https://api.test.example.com/health


⸻

5) docker-compose.dev.yml prüfen (wichtig)

❗ Keine hardcodierten URLs im Web-Service:

environment:
  NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
  API_BASE_URL: ${API_BASE_URL}

Kein http://localhost:8080 im Compose!

⸻

6) Container starten

docker compose -f docker-compose.dev.yml up -d --build

Status prüfen:

docker compose -f docker-compose.dev.yml ps

Logs:

docker compose -f docker-compose.dev.yml logs -f --tail=200 api
docker compose -f docker-compose.dev.yml logs -f --tail=200 web
docker compose -f docker-compose.dev.yml logs -f --tail=200 runner


⸻

Zugriff
	•	Web UI
👉 https://test.example.com
	•	API Health
👉 https://api.test.example.com/health
	•	Login
	•	Admin User wird beim ersten Start automatisch angelegt
	•	Login mit ADMIN_EMAIL / ADMIN_PASSWORD

⸻

Häufige Fehler & Fixes

❌ Login → NetworkError / CORS

Ursache:
	•	falsche NEXT_PUBLIC_API_URL
	•	.env wird im Compose überschrieben

Fix:

docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml build --no-cache web
docker compose -f docker-compose.dev.yml up -d


⸻

❌ Runner startet nicht

Fehler:

Missing env: BITMART_BASE_URL

Fix:

BITMART_BASE_URL=https://api-cloud.bitmart.com

Dann:

docker compose -f docker-compose.dev.yml up -d runner


⸻

❌ HTTPS funktioniert nicht

snap services | grep caddy
sudo snap logs caddy.server -n 100
sudo ss -ltnp | egrep ':80|:443'


⸻

Dev vs Production

Development
	•	docker-compose.dev.yml
	•	next dev
	•	Hot Reload
	•	Runner im Dev-Modus

Production (geplant)
	•	docker-compose.yml
	•	next build && next start
	•	Lizenzprüfung aktiv
	•	Monitoring / Alerts

⸻

Roadmap
	•	✅ Market Making
	•	✅ Volume Bot
	•	✅ Multi-Service Architektur
	•	🔜 Lizenzserver
	•	🔜 SaaS Billing
	•	🔜 Multi-CEX (Slave Exchanges)
	•	🔜 Production Hardening
	•	🔜 Metrics & Monitoring

⸻

Lizenz

Private / Proprietary – noch nicht final definiert.

---

Wenn du möchtest, mache ich dir als Nächstes auch:

- 📄 `LICENSE.md`
- 📄 `CEDEX_INTEGRATION_CHECKLIST.md`
- 📄 `PRODUCTION_DEPLOYMENT.md`
- 📄 `SECURITY.md`

Sag einfach welches 👍