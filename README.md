# Crypto Market Making & Volume Bot (TypeScript)

Dieses Projekt ist eine **webbasierte Market-Making- und Volume-Trading-Engine** für Kryptowährungen.
Aktuell ist es für den **Eigenbetrieb (1 User / 1 VPS)** ausgelegt und später ohne Refactoring
als **SaaS mit separatem VPS pro User** nutzbar.

## Ziel
- Liquidität für Low- & Mid-Cap Token bereitstellen
- Kontrolliertes tägliches Handelsvolumen erzeugen
- Risiko strikt begrenzen
- Vollständig webbasiert konfigurierbar
- Stabiler Dauerbetrieb auf einem VPS

---

## Features (MVP)

### Market Making
- Grid-basiertes Market Making (Spot)
- Einstellbare Anzahl von Orders ober- und unterhalb des Preises
- Budget pro Seite:
  - Quote (USDT) für Buy-Seite
  - Base Token für Sell-Seite
  - Min/Max pro Order für Buy und Sell Seite
- Spread in %
  - Min spread %
  - Max spread %
- Order-Verteilung:
  - `LINEAR`
  - `VALLEY` (mehr Volumen nahe Mid)
  - `RANDOM`
- Inventory-Skew (Trend-Schutz)
- Post-Only Orders

### Volume Bot
- Ziel-Notional pro Tag (USDT)
- Zufällige Trade-Events (nicht deterministisch)
- Zeitfenster für Aktivität
- Maker-first Execution (optional Mixed)
- Min/Max Tradegröße
- Hard Limits & Kill-Switches

### Risk & Safety
- Mindest-USDT-Saldo
- Max. Preisabweichung
- Max. offene Orders
- Daily Loss Limit
- API-Error & Reject Schutz
- Stale Market Data Stop
- Cancel-All & Pause-Mechanismus

### Web UI
- Vollständige Bot-Konfiguration über Web
- Start / Stop / Pause
- Live-Ansicht:
  - Open Orders
  - Fills
  - Inventory
  - Mid Price
  - Risk-Status
- Event- & Error-Logs

### Telegram benachrichtigung
  - Ereigniss Meldungen über Telegram Bot (API Key von Botfather)

---

## Aktueller Scope

| Bereich        | Status |
|----------------|--------|
| Exchange       | Bitmart |
| Markt          | Spot |
| Symbol         | USHARK/USDT |
| Tokens         | 1 (erweiterbar) |
| Master/Slave   | Slave-only (vorbereitet für später) |
| Betrieb        | Single VPS |

---

## Architektur

apps/
├─ web/        # Web UI (Next.js)
├─ api/        # REST API
└─ runner/     # Bot Runner (MM + Volume + Risk)

packages/
├─ core/       # Shared Types & Utils
├─ exchange/   # Exchange Interfaces & Bitmart Connector
├─ strategy/   # Market Making & Volume Strategien
├─ risk/       # Risk Engine
└─ pricing/    # Price Source Abstraction

infra/
├─ docker/
├─ postgres/
└─ nginx/

---

## Technologie-Stack

- **TypeScript**
- **Node.js**
- **Next.js** (Web UI)
- **PostgreSQL**
- **Prisma ORM**
- **WebSockets** (Market Data & Order Updates)
- **Docker** (Deployment)

---

## Bot Lifecycle

INIT
↓
SYNC_BALANCES
↓
START_QUOTING
↓
RUNNING
↙        ↘
PAUSED   ERROR
↓        ↓
RESUME   STOPPED

---

## Konfiguration (Webbasiert)

### Market Making
- Spread (%)
- Step (%)
- Levels Up / Down
- Budget Quote / Base
- Distribution
- Skew-Faktor

### Volume Bot
- Daily Notional (USDT)
- Min / Max Tradegröße
- Aktiv-Zeiten
- Execution Mode

### Risk
- Mindest-USDT
- Max Preisabweichung
- Max offene Orders
- Max Daily Loss

---

## Sicherheit & Verantwortung

⚠️ **Wichtiger Hinweis**

Viele Börsen verbieten künstliches Volumen, Wash-Trading oder Self-Trading.
Dieses Projekt ist für **Eigenbetrieb und Research** gedacht.

Der Betreiber ist selbst verantwortlich für:
- Einhaltung der Börsen-AGB
- Konfiguration der Risk Limits
- Nutzung der Volume-Funktion

---

## Roadmap

### Phase 1 (aktuell)
- Stabiler Market Maker + Volume Bot
- Web UI
- Bitmart
- 1 Token

### Phase 2
- Zweiter Token
- Master/Slave Price Referenz
- Verbesserte Inventory-Steuerung
- Alerts (Telegram / Discord)

### Phase 3 (optional SaaS)
- VPS-Provisioning
- Lizenz-/Abo-Check
- User-Isolation pro VPS
- Monitoring & Billing

---

## Entwicklung starten

```bash
# Abhängigkeiten installieren
npm install

# Datenbank starten
docker compose up -d postgres

# Prisma
npx prisma migrate dev

# Development
npm run dev
